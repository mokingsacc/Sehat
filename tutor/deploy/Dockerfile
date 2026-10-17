# The fallback kit (BUILD-PLAN P12): Qalam online as one container, for Render in Frankfurt or any host that runs
# an image, if the Cloudflare Worker fails its gate (D6). Not deployed. It is the hub's own app in online mode, as
# the Worker runs it: no printer and no teacher PIN (print and teacher off), the online consent text, limits by
# learner token, the fake AI provider until a key exists. The database is SQLite on the disk mounted at /data.
#   docker build -f deploy/Dockerfile -t qalam-online .        (from tutor/)
#   docker run -p 8080:8080 -v qalam-data:/data qalam-online
FROM python:3.13.7-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TUTOR_DATA=/data \
    TUTOR_HOME=online \
    TUTOR_LACKS=printer,pin \
    TUTOR_AI_PROVIDER=anthropic,fake \
    TUTOR_STAFF_GATE=off \
    FORWARDED_ALLOW_IPS=* \
    PORT=8080
# TUTOR_AI_PROVIDER: as staging, Claude when ANTHROPIC_API_KEY is set in the host's settings, else the fake
# TUTOR_STAFF_GATE=off: no Cloudflare Access stands in front of this container, so it serves no staff page (/review/)
# FORWARDED_ALLOW_IPS: the host's proxy is the only way in, so its X-Forwarded-For names the phone's address (the
# join limit counts addresses); never set it where the container can be reached directly

WORKDIR /srv/tutor
COPY deploy/requirements.txt deploy/requirements.txt
RUN pip install --no-cache-dir -r deploy/requirements.txt

COPY hub/tutor_hub hub/tutor_hub
COPY migrations migrations
COPY modules modules
COPY cohorts cohorts
COPY content content
COPY app app

RUN useradd --system --uid 10001 qalam && mkdir -p /data && chown qalam /data
USER qalam
WORKDIR /srv/tutor/hub
EXPOSE 8080
CMD ["sh", "-c", "exec python -m tutor_hub serve --host 0.0.0.0 --port \"$PORT\""]
