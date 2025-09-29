FROM debian:trixie-slim
LABEL authors="jcake"

ENTRYPOINT ["top", "-b"]