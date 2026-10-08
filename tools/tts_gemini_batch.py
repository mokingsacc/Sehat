"""Make the Gemini narration through Google's Batch API instead of one request at a time.

Why: a paid Gemini key may send only 100 text-to-speech requests a day per model, and the book needs about 1,900.
A batch is not held to that limit and costs half as much. Google usually returns it within minutes (at most 24 hours).

Same text, voices, style, clip checks, manifest and output as tools/tts_gemini.py (its settings are used):
audio/<lang>-<f|m>/<id>.mp3, unchanged lines skipped, identical lines made once and copied, human recordings kept.

  export GEMINI_API_KEY=...
  GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts python3 tools/tts_gemini_batch.py
  python3 tools/build.py

If it is stopped while waiting, run it again: the job name is kept in audio/tts-batch.json and it picks up the results.
Clips that come back far too short or long are sent again in a second (and third) batch, then listed to listen to.
"""
import base64, csv, hashlib, json, os, shutil, subprocess, sys, time, urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tts_gemini as T

API = "https://generativelanguage.googleapis.com"
STATE = T.J("audio", "tts-batch.json")
DONE = {"JOB_STATE_SUCCEEDED", "BATCH_STATE_SUCCEEDED"}
ENDED = DONE | {"JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED", "BATCH_STATE_FAILED", "BATCH_STATE_CANCELLED", "BATCH_STATE_EXPIRED"}


def to_mp3(data, mime, out):
    """Same result as tts_gemini.to_mp3, in two steps with a time limit: the one-step filter chain froze ffmpeg on some clips."""
    src = ["-f", "s16le", "-ar", "24000", "-ac", "1"] if "l16" in mime.lower() or "pcm" in mime.lower() else []
    trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
    a = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-i", "pipe:0", "-af", trim, "-f", "wav", "pipe:1"], input=data, capture_output=True, timeout=120)
    tmp = out + ".part.mp3"
    b = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0", "-af", "loudnorm=I=-18:TP=-2", *T.MP3, tmp], input=a.stdout, timeout=120)
    if a.returncode or b.returncode: raise RuntimeError(f"ffmpeg failed for {out}")
    os.replace(tmp, out)


def call(method, url, key, body=None, headers=None, raw=False, timeout=120):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    h = {"x-goog-api-key": key, **({"Content-Type": "application/json"} if data and not headers else {}), **(headers or {})}
    for attempt in range(6):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, data, h, method=method), timeout=timeout)
            return r if raw else json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:800]
            if e.code in (429, 500, 502, 503) and attempt < 5: time.sleep(10 * (attempt + 1)); continue
            sys.exit(f"Gemini said {e.code} for {url.split('?')[0]}: {msg}")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 5: time.sleep(10); continue
            sys.exit(f"Request failed: {e}")


def upload(lines, key):
    data = "".join(json.dumps(l, ensure_ascii=False) + "\n" for l in lines).encode()
    start = call("POST", f"{API}/upload/v1beta/files", key, {"file": {"display_name": "sehat-narration"}}, raw=True, headers={
        "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(data)), "X-Goog-Upload-Header-Content-Type": "application/jsonl"})
    url = start.headers["x-goog-upload-url"]
    res = json.load(urllib.request.urlopen(urllib.request.Request(url, data, {
        "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": str(len(data))}, method="POST"), timeout=600))
    return res["file"]["name"]


def submit(items, key):
    lines = [{"key": k, "request": {"contents": [{"parts": [{"text": f"{T.STYLE[lang]}\n\n{text}"}]}],
                                    "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {
                                        "prebuiltVoiceConfig": {"voiceName": T.VOICES[voice]}}}}}}
             for k, (lang, voice, text) in items.items()]
    f = upload(lines, key)
    job = call("POST", f"{API}/v1beta/models/{T.CURRENT['model']}:batchGenerateContent", key,
               {"batch": {"display_name": "sehat-narration", "input_config": {"file_name": f}}})
    print(f"sent {len(lines)} clips as {job['name']}")
    return job["name"]


def wait(name, key):
    while True:
        b = call("GET", f"{API}/v1beta/{name}", key)
        md = b.get("metadata", b); state = md.get("state", "")
        if state in ENDED:
            if state not in DONE: sys.exit(f"The batch ended as {state}: {json.dumps(b)[:600]}")
            return b
        print(f"  {state.split('_')[-1].lower()}: {json.dumps(md.get('batchStats', {}))}"); sys.stdout.flush()
        time.sleep(60)


def results(b, key, tmp):
    """Yield (key, response or error) for each line of the batch's results file, streamed to disk first."""
    resp = b.get("response", {}) or b.get("metadata", {}).get("output", {})
    f = resp.get("responsesFile") or resp.get("output", {}).get("responsesFile")
    if f:
        for attempt in range(5):  # a long download can be cut off part way; fetch it again until every line reads
            try:
                with call("GET", f"{API}/download/v1beta/{f}:download?alt=media", key, raw=True) as r, open(tmp, "wb") as out:
                    shutil.copyfileobj(r, out, 1 << 20)
                with open(tmp, encoding="utf-8") as fh:
                    rows = [json.loads(line) for line in fh if line.strip()]
                break
            except (ValueError, OSError) as e:
                print(f"  results download incomplete ({type(e).__name__}), fetching again"); time.sleep(10)
        else:
            sys.exit("Could not download the batch results; run this again (the batch is kept and will not be paid for twice).")
        os.remove(tmp)
        for d in rows: yield d.get("key"), d.get("response"), d.get("error")
    else:
        for d in (resp.get("inlinedResponses", {}) or {}).get("inlinedResponses", []):
            yield d.get("metadata", {}).get("key"), d.get("response"), d.get("error")


def log_usage(entry):
    up = T.J("audio", "tts-usage.json")
    hist = json.load(open(up, encoding="utf-8")) if os.path.exists(up) else []
    hist.append(entry); json.dump(hist, open(up, "w", encoding="utf-8"), indent=1)


def main():
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("Set GEMINI_API_KEY first.")
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool): sys.exit(f"{tool} is not installed; install ffmpeg first (nothing was sent to Gemini).")
    T.CURRENT["model"] = model = T.pick_model(key)
    print(f"model {model} (batch)")
    plan, copies, mans = {}, [], {}  # key -> (lang, voice, text); identical lines to copy; manifests per folder
    skipped = human = 0
    hold = tuple(x for x in os.environ.get("GEMINI_TTS_HOLD", "").split(",") if x)  # id prefixes to leave for later
    for voice in ["f", "m"]:
        for lang in ["fa", "ps"]:
            rows = T.order(list(csv.DictReader(open(T.J("content", "scripts", f"narration-{lang}.tsv"), encoding="utf-8"), delimiter="\t")))
            d = T.J("audio", f"{lang}-{voice}"); os.makedirs(d, exist_ok=True)
            man_p = os.path.join(d, "tts-manifest.json")
            man = mans[(lang, voice)] = json.load(open(man_p, encoding="utf-8")) if os.path.exists(man_p) else {}
            files = set(os.listdir(d)); first = {}
            for r in rows:  # same rules as tools/tts_gemini.py
                text = r["text"].strip()
                if not text or (hold and r["id"].startswith(hold)): continue
                h = hashlib.sha1(f"{T.VOICES[voice]}|{T.STYLE[lang]}|{text}|{' '.join(T.MP3)}".encode()).hexdigest()[:12]
                out = os.path.join(d, r["id"] + ".mp3")
                others = [f for f in files if os.path.splitext(f)[0] == r["id"] and f != r["id"] + ".mp3"]
                if (r["id"] + ".mp3" in files and r["id"] not in man) or others: human += 1; continue
                if man.get(r["id"]) == h and os.path.exists(out): skipped += 1; continue
                done = first.get(h) or next((i for i, v in man.items() if v == h and os.path.exists(os.path.join(d, i + ".mp3"))), None)
                if done: copies.append((lang, voice, done, r["id"], h)); continue
                first[h] = r["id"]; plan[f"{lang}-{voice}|{r['id']}|{h}"] = (lang, voice, text)
    print(f"{len(plan)} to make, {len(copies)} copies of identical lines, {skipped} unchanged, {human} human recordings kept")

    usage = {"in": 0, "out": 0, "requests": 0}; made = 0; flags = []

    def run(chunk, last):
        """Send one batch (or pick up the one already sent), write its clips; return the ones to send again."""
        state = json.load(open(STATE)) if os.path.exists(STATE) else {}
        name = state.get("job") if state.get("model") == model and set(state.get("keys", [])) == set(chunk) else None
        if not name:
            name = submit(chunk, key)
            json.dump({"job": name, "model": model, "keys": sorted(chunk)}, open(STATE, "w"), indent=1)
        nonlocal made
        b = wait(name, key); again = {}; before = (usage["in"], usage["out"], made)
        try:
            collect(b, chunk, again, last)
        finally:  # keep the manifest in step with the clips on disk, even if the run is stopped part way
            for (lang, voice), man in mans.items():
                json.dump(man, open(T.J("audio", f"{lang}-{voice}", "tts-manifest.json"), "w", encoding="utf-8"), indent=0, sort_keys=True)
        return finish(name, chunk, again, before)

    def collect(b, chunk, again, last):
        nonlocal made
        for k, res, err in results(b, key, STATE + ".results.jsonl"):
            if k not in chunk: continue
            lang, voice, text = chunk[k]; _, i, h = k.split("|")
            out = T.J("audio", f"{lang}-{voice}", i + ".mp3")
            try:
                part = res["candidates"][0]["content"]["parts"][0]["inlineData"]
            except (TypeError, KeyError, IndexError):
                again[k] = chunk[k]; print(f"  {lang}-{voice} {i}: no audio ({json.dumps(err or res)[:200]})"); continue
            u = res.get("usageMetadata", {}); usage["requests"] += 1
            usage["in"] += u.get("promptTokenCount", 0); usage["out"] += u.get("candidatesTokenCount", 0)
            try:
                to_mp3(base64.b64decode(part["data"]), part.get("mimeType", ""), out)
            except (subprocess.TimeoutExpired, RuntimeError) as e:
                again[k] = chunk[k]; print(f"  {lang}-{voice} {i}: could not convert ({type(e).__name__}), sending again"); continue
            want, got = len(text) / T.CHARS_PER_SEC, T.seconds(out)
            ok = 0.4 * want <= got <= 2.5 * want + 2
            if not ok and not last:
                again[k] = chunk[k]; print(f"  {lang}-{voice} {i}: {got:.1f}s for {len(text)} letters, sending again"); continue
            if not ok: flags.append(f"{lang}-{voice}/{i}.mp3: {got:.1f}s, expected about {want:.0f}s; listen to it")
            mans[(lang, voice)][i] = h; made += 1

    def finish(name, chunk, again, before):
        for k in chunk:  # anything the results left out
            if k not in again and mans[(chunk[k][0], chunk[k][1])].get(k.split("|")[1]) != k.split("|")[2]: again[k] = chunk[k]
        for (lang, voice), man in mans.items():
            json.dump(man, open(T.J("audio", f"{lang}-{voice}", "tts-manifest.json"), "w", encoding="utf-8"), indent=0, sort_keys=True)
        n_in, n_out = usage["in"] - before[0], usage["out"] - before[1]
        log_usage({"when": time.strftime("%Y-%m-%d %H:%M"), "model": model + " (batch)", "batch": name, "made": made - before[2],
                   "input_tokens": n_in, "audio_tokens": n_out, "estimated_usd": round((n_in * T.PRICE_IN + n_out * T.PRICE_OUT) / 2 / 1e6, 2)})
        os.remove(STATE)
        return again

    # a new key may only queue so much at once, so the work goes in slices, in the book's order (women's voices, danger pages first)
    size = int(os.environ.get("GEMINI_BATCH_SIZE", "300"))
    todo, first = dict(plan), None
    if os.path.exists(STATE):  # a batch sent by a run that was stopped: collect it first, so it is not paid for twice
        st = json.load(open(STATE))
        if st.get("model") == model and st.get("keys") and all(k in todo for k in st["keys"]): first = st["keys"]
    for round_ in range(3):
        if not todo: break
        keys, slices, again = list(todo), [], {}
        if first: slices.append(first); keys = [k for k in keys if k not in set(first)]; first = None
        slices += [keys[n:n + size] for n in range(0, len(keys), size)]
        for sl in slices:
            again.update(run({k: todo[k] for k in sl}, round_ == 2))
            print(f"round {round_ + 1}: {made} clips made so far")
        todo = again

    copied = 0
    for lang, voice, src, dst, h in copies:  # identical wording: one request, many clips
        man = mans[(lang, voice)]; s = T.J("audio", f"{lang}-{voice}", src + ".mp3")
        if man.get(src) == h and os.path.exists(s):
            shutil.copyfile(s, T.J("audio", f"{lang}-{voice}", dst + ".mp3")); man[dst] = h; copied += 1
    for (lang, voice), man in mans.items():
        json.dump(man, open(T.J("audio", f"{lang}-{voice}", "tts-manifest.json"), "w", encoding="utf-8"), indent=0, sort_keys=True)

    cost = (usage["in"] * T.PRICE_IN + usage["out"] * T.PRICE_OUT) / 2 / 1e6  # batch is half price
    log_usage({"when": time.strftime("%Y-%m-%d %H:%M"), "model": model + " (batch)", "copied": copied, "check": flags,
               "note": "end of run; each batch above has its own tokens and cost"})
    print(f"made {made}, copied {copied}, skipped {skipped} unchanged, kept {human} human recordings; about ${cost:.2f} (batch price).")
    for fl in flags: print("  listen to:", fl)
    if todo: print(f"{len(todo)} clips still missing; run this again.")
    print("Now run: python3 tools/build.py")


if __name__ == "__main__":
    main()
