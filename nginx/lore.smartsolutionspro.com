server {
    listen 80;
    server_name lore.smartsolutionspro.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name lore.smartsolutionspro.com;

    ssl_certificate     /etc/letsencrypt/live/lore.smartsolutionspro.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lore.smartsolutionspro.com/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Authorization $http_authorization;
        proxy_read_timeout 30s;
    }
}
