FROM rust:trixie AS rust

LABEL authors="jcake"

WORKDIR "/app"
RUN apt update && apt upgrade -y && apt install jq -y
COPY "./" "/app/certmaster"
WORKDIR "/app/certmaster"
RUN mkdir -p "./out"
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/certmaster/target \
    cp $(cargo build --release --message-format json | jq -sr '.[] | select(.reason == "compiler-artifact" and .executable).executable') ./out

FROM node:trixie AS node

LABEL authors="jcake"

COPY --from=rust "/app/certmaster" "/app/certmaster"
WORKDIR "/app/certmaster"
RUN npm install
RUN npm run build:release

FROM debian:trixie-slim AS certmaster

LABEL authors="jcake"

RUN mkdir -p "./out" "/etc/certmaster"
COPY --from=rust "/app/certmaster/out/*" "/bin"
COPY --from=rust "/app/certmaster/config.toml" "/etc/certmaster/config.toml"

#VOLUME "/etc/certmaster"

ENV RUST_LOG=info

ENTRYPOINT ["/bin/certmaster"]
