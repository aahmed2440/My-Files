FROM node:22-alpine
WORKDIR /app
COPY runtime.gz.b64 parity_cert.cjs durability_cert.cjs boot.cjs ./
RUN node --check boot.cjs && node --check parity_cert.cjs && node --check durability_cert.cjs
ENV PORT=3000
EXPOSE 3000
CMD ["node","boot.cjs"]
