FROM rust:trixie AS rust

LABEL authors="jcake"

ARG CHECKOUT="https://github.com/J-Cake/certmaster.git/"

WORKDIR "/app"
RUN apt update && apt upgrade -y && apt install jq -y
RUN git clone ${CHECKOUT} && cd certmaster
WORKDIR "/app/certmaster"
RUN mkdir out
RUN cp $(cargo build --release --message-format json | jq -sr '.[] | select(.reason == "compiler-artifact" and .executable).executable') ./out

FROM node:trixie AS node

LABEL authors="jcake"

WORKDIR "/app"
COPY --from=rust "/app/certmaster" "/app/certmaster"
RUN npm install
RUN npm run build:release

FROM debian:trixie-slim AS run

LABEL authors="jcake"

RUN mkdir "./out"
COPY --from=rust "/app/certmaster/out/*" "/bin"

RUN mkdir -p "/etc/certmaster"
COPY --from=rust "/app/certmaster/config.toml" "/etc/certmaster/config.toml"
VOLUME "/etc/certmaster"

ENV RUST_LOG=info

ENTRYPOINT ["/bin/certmaster"]
CMD ["-c", "/etc/certmaster/config.toml"]