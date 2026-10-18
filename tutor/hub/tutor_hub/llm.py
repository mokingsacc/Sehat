"""The model client: any server that speaks the OpenAI chat API (llama.cpp's llama-server, vLLM, Ollama on the hub).
Nothing calls it directly: the AI gateway (ai/) wraps it as a provider and decides whether a call may happen.

The model is a file the hub's owner can swap (setup/llama-server.service points at /opt/qalam/models/current.gguf).
The hub works without it: no AI means checked answers, lesson passages and the teacher, nothing worse.
"""
import logging
import time

import httpx

log = logging.getLogger("tutor.llm")

LANG_NAMES = {"prs": "Dari (Afghan Persian, Arabic script)", "ps": "Pashto (Arabic script)", "en": "simple English"}
SUBJECT_NAMES = {"maths": "maths", "science": "science", "english": "English", "dari": "Dari reading and writing",
                 "pashto": "Pashto reading and writing"}

SYSTEM = """You are a patient school tutor at a village learning centre in Afghanistan, helping a child in year {year} with {subject}.
Answer in {language}, in at most {sentences} short sentences that a child can read aloud.
Use the lesson notes below when they help, and never contradict them.
Only answer school questions about maths, science, English, Dari or Pashto. For anything else, say kindly that the child should ask their teacher or family.
Never discuss politics, religious rulings, weapons or adult topics. Never ask for the child's name, address or photos.
Write each sum on one line with = and its result, using the digits 0-9, for example 1/2 + 1/4 = 3/4, so it can be checked.
If you are not sure, say so and suggest asking the teacher.

Lesson notes:
{notes}"""


class LLM:
    def __init__(self, url: str | None, model: str = "local", timeout: float = 60.0, api_key: str | None = None):
        self.url = (url or "").rstrip("/")
        self.model = model
        self.timeout = timeout
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._seen = (0.0, False)
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        """One client for every call, made on first use, so connections to the model server are reused."""
        if self._client is None:
            self._client = httpx.AsyncClient()
        return self._client

    async def aclose(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def configured(self) -> bool:
        return bool(self.url)

    async def available(self) -> bool:
        """Is the model server answering? Checked at most every 30 seconds."""
        if not self.url:
            return False
        at, ok = self._seen
        if time.monotonic() - at < 30:
            return ok
        try:
            ok = (await self._http().get(f"{self.url}/models", headers=self.headers, timeout=3)).status_code == 200
        except httpx.HTTPError:
            ok = False
        self._seen = (time.monotonic(), ok)
        return ok

    async def chat(self, messages: list[dict], max_tokens: int = 350, temperature: float = 0.2) -> str | None:
        return (await self.complete(messages, max_tokens, temperature))[0]

    async def complete(self, messages: list[dict], max_tokens: int = 350,
                       temperature: float = 0.2, extra: dict | None = None) -> tuple[str | None, dict]:
        """(the answer or None, the token counts the server reported: {"in": n, "out": n}). `extra` adds fields to
        the request (`store: false` for a picture)."""
        if not self.url:
            return None, {"in": 0, "out": 0}
        try:
            r = await self._http().post(f"{self.url}/chat/completions", headers=self.headers, timeout=self.timeout,
                                        json={"model": self.model, "messages": messages, "max_tokens": max_tokens,
                                              "temperature": temperature, "stream": False, **(extra or {})})
            r.raise_for_status()
            body = r.json()
            text = body["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError, AttributeError) as e:
            log.warning("model server did not answer: %s", e)
            self._seen = (time.monotonic(), False)
            return None, {"in": 0, "out": 0}
        usage = body.get("usage") if isinstance(body, dict) else None
        usage = usage if isinstance(usage, dict) else {}
        counts = {k: v if type(v) is int and v >= 0 else 0
                  for k, v in (("in", usage.get("prompt_tokens")), ("out", usage.get("completion_tokens")))}
        text = text.strip() if isinstance(text, str) else ""
        if "</think>" in text:              # reasoning models: keep only the answer
            text = text.split("</think>")[-1].strip()
        return text or None, counts


def prompt(question: str, *, lang: str, year, subject, notes: list[str]) -> list[dict]:
    young = not isinstance(year, int) or year <= 6
    shown_year = year if isinstance(year, int) and year > 0 else "1 (just starting)"
    system = SYSTEM.format(year=shown_year, subject=SUBJECT_NAMES.get(subject, "their school subjects"),
                           language=LANG_NAMES.get(lang, LANG_NAMES["prs"]),
                           sentences=3 if young else 5,
                           notes="\n".join(f"- {n}" for n in notes) or "- (none)")
    return [{"role": "system", "content": system}, {"role": "user", "content": question}]
