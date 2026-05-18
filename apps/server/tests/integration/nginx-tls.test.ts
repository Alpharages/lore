import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const nginxConfPath = path.resolve(process.cwd(), "nginx/nginx.conf");

describe("Nginx TLS Configuration", () => {
  const config = fs.readFileSync(nginxConfPath, "utf-8");

  it("contains HTTP → HTTPS redirect block on port 80", () => {
    expect(config).toMatch(/listen\s+80;/);
    expect(config).toMatch(/return\s+301\s+https:\/\/\$host\$request_uri;/);
  });

  it("contains HTTPS server block on port 443 with ssl", () => {
    expect(config).toMatch(/listen\s+443\s+ssl;/);
  });

  it("enforces TLS 1.2+ only", () => {
    expect(config).toMatch(/ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;/);
    expect(config).not.toMatch(/TLSv1\.0/);
    expect(config).not.toMatch(/TLSv1\.1/);
  });

  it("configures secure cipher suite", () => {
    expect(config).toMatch(/ssl_ciphers\s+/);
    expect(config).toMatch(/ECDHE-ECDSA-AES128-GCM-SHA256/);
    expect(config).toMatch(/ECDHE-RSA-AES128-GCM-SHA256/);
  });

  it("prefers server ciphers", () => {
    expect(config).toMatch(/ssl_prefer_server_ciphers\s+on;/);
  });

  it("configures SSL session cache and timeout", () => {
    expect(config).toMatch(/ssl_session_cache\s+shared:SSL:10m;/);
    expect(config).toMatch(/ssl_session_timeout\s+10m;/);
  });

  it("sets X-Forwarded-Proto to https", () => {
    expect(config).toMatch(/proxy_set_header\s+X-Forwarded-Proto\s+https;/);
  });

  it("passes Authorization header to upstream", () => {
    expect(config).toMatch(/proxy_set_header\s+Authorization\s+\$http_authorization;/);
  });

  it("proxies to mcp-server on port 3100", () => {
    expect(config).toMatch(/proxy_pass\s+http:\/\/mcp-server:3100;/);
  });

  it("has syntactically valid nginx config (if Docker available)", () => {
    // Generate temporary self-signed certs so nginx -t can validate
    const certsDir = path.resolve(process.cwd(), "nginx/certs");
    fs.mkdirSync(certsDir, { recursive: true });

    const keyPath = path.join(certsDir, "privkey.pem");
    const certPath = path.join(certsDir, "fullchain.pem");

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      const openssl = spawnSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:4096",
          "-keyout",
          keyPath,
          "-out",
          certPath,
          "-days",
          "1",
          "-nodes",
          "-subj",
          "/CN=localhost",
        ],
        { encoding: "utf-8", timeout: 10_000 }
      );
      if (openssl.status !== 0) {
        console.warn("openssl failed, skipping Docker nginx syntax test");
        return;
      }
    }

    const docker = spawnSync("docker", ["--version"], { encoding: "utf-8", timeout: 5_000 });
    if (docker.status !== 0) {
      console.warn("Docker not available, skipping nginx syntax test");
      return;
    }

    const imageCheck = spawnSync("docker", ["images", "-q", "nginx:alpine"], {
      encoding: "utf-8",
      timeout: 5_000,
    });
    if (!imageCheck.stdout.trim()) {
      console.warn(
        "nginx:alpine image not present locally, skipping syntax test to avoid pull timeout"
      );
      return;
    }

    const result = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${nginxConfPath}:/etc/nginx/nginx.conf:ro`,
        "-v",
        `${certsDir}:/etc/nginx/certs:ro`,
        "nginx:alpine",
        "nginx",
        "-t",
      ],
      { encoding: "utf-8", timeout: 15_000 }
    );

    if (result.status === null && result.signal === "SIGTERM") {
      console.warn("Docker timed out, skipping nginx syntax test");
      return;
    }

    // The `mcp-server` upstream hostname only resolves inside the docker-compose
    // network; when this test runs standalone (CI, local without compose up),
    // nginx -t fails at DNS resolution rather than at config-syntax validation.
    // Skip in that case — we still want this test to catch real syntax errors.
    if (result.stderr.includes('host not found in upstream "mcp-server"')) {
      console.warn(
        "mcp-server upstream not resolvable outside docker-compose, skipping nginx syntax test"
      );
      return;
    }

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("syntax is ok");
    expect(result.stderr).toContain("test is successful");
  });
});
