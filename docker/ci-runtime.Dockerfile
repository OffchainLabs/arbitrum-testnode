ARG FOUNDRY_IMAGE=ghcr.io/foundry-rs/foundry:v1.3.5
ARG NITRO_IMAGE=offchainlabs/nitro-node:v3.9.5-66e42c4

FROM ${FOUNDRY_IMAGE} AS foundry

FROM ${NITRO_IMAGE}

COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --chmod=755 docker/ci-runtime-entrypoint.sh /usr/local/bin/arbitrum-testnode-ci
COPY --chmod=755 docker/ci-runtime-healthcheck.sh /usr/local/bin/healthcheck.sh
COPY docker/ci-runtime-server.py /usr/local/bin/config-server.py
COPY .ci-runtime-context/export-config /opt/arbitrum-testnode/export-config
COPY .ci-runtime-context/metadata.json /opt/arbitrum-testnode/metadata.json
COPY .ci-runtime-context/runtime /opt/arbitrum-testnode/runtime
COPY .ci-runtime-context/runtime-config /opt/arbitrum-testnode/runtime-config
USER root
RUN chown -R user:user /opt/arbitrum-testnode/runtime /opt/arbitrum-testnode/runtime-config
RUN mkdir -p /tokenbridge-data && chown user:user /tokenbridge-data
USER user

EXPOSE 8545 8547 8548 8549 8550 8080

HEALTHCHECK --interval=3s --timeout=3s --start-period=30s --retries=10 \
	CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/arbitrum-testnode-ci"]
