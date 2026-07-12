FROM node:22-alpine

RUN apk add --no-cache git ca-certificates \
    && adduser --disabled-password --uid 10001 sandbox \
    && printf '%s\n' \
      '#!/bin/sh' \
      'case "$1" in' \
      '  *Username*) printf "%s\\n" "x-access-token" ;;' \
      '  *Password*) printf "%s\\n" "$SHOULDBOT_GITHUB_TOKEN" ;;' \
      '  *) exit 1 ;;' \
      'esac' \
      > /usr/local/bin/shouldbot-git-askpass \
    && chmod 0755 /usr/local/bin/shouldbot-git-askpass

USER sandbox
WORKDIR /workspace

CMD ["sleep", "infinity"]
