# Nginx TLS Certificates

Place your TLS certificate files in this directory:

- `fullchain.pem` — certificate chain (server cert + intermediates)
- `privkey.pem` — private key

## Local Development (Self-Signed)

Use [mkcert](https://github.com/FiloSottile/mkcert) for local HTTPS:

```bash
mkcert -install
mkcert -cert-file nginx/certs/fullchain.pem -key-file nginx/certs/privkey.pem localhost
```

## Production

Drop in certificates from your CA or Let's Encrypt. Automated renewal is a post-v1.0 feature.

**Note:** Real `.pem` and `.key` files are gitignored. Only this README and `.gitkeep` are committed.
