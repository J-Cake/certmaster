FROM rust:trixie AS rust

LABEL authors="jcake"

RUN mkdir -p "/app/certmaster/out"
WORKDIR "/app"

RUN apt update && apt upgrade -y && apt install jq -y

COPY "./" "/app/certmaster"
WORKDIR "/app/certmaster"

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/certmaster/target \
    cp $(cargo build --workspace --all-targets --release --message-format json | jq -sr '.[] | select(.reason == "compiler-artifact" and .executable).executable') /app/certmaster/out

FROM node:trixie AS node

LABEL authors="jcake"

COPY --from=rust "/app/certmaster" "/app/certmaster"
WORKDIR "/app/certmaster"
RUN npm install
RUN npm run build:release

FROM debian:trixie-slim AS certmaster

LABEL authors="jcake"

RUN mkdir -p "/etc/certmaster/out"
COPY --from=rust "/app/certmaster/out/*" "/usr/bin"
COPY --from=rust "/app/certmaster/config.toml" "/etc/certmaster/config.toml"

#VOLUME "/etc/certmaster"

ENV RUST_LOG=info

ENTRYPOINT ["certmaster"]
