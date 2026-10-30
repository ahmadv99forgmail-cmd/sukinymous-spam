const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys")
const pino = require("pino")
const readline = require("readline")
const fs = require("fs")
const config = require("./config")

const logger = pino({ level: "silent" })
let sock, isPaired = false, tgt = [], tgtName = ""
let spamming = false, timer = null, rl

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
        rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question(q, (ans) => { rl.close(); res(ans.trim()) })
    })
}

process.on('SIGINT', () => {
    if (spamming) {
        spamming = false
        clearTimeout(timer)
        clr(); console.log(BANNER); console.log("\x1b[31m[STOPPED]\x1b[0m")
        setTimeout(menu, 1000)
    } else {
        process.exit(0)
    }
})

async function menu() {
    clr(); console.log(BANNER)
    console.log(isPaired ? `[1] Target: ${tgtName || "None"}` : `[1] Target (Locked)`)
    if (!isPaired) console.log(`[2] Pairing`)
    console.log(`[3] Spam`)
    console.log(`[4] Exit\n`)

    const c = await ask("> ")
    if (c === "1" && isPaired) return select()
    if (c === "2" && !isPaired) return pair()
    if (c === "3" && isPaired && tgt.length) return spam()
    if (c === "4") process.exit(0)
    return menu()
}

async function pair() {
    if (!sock) return console.log("[!] Menunggu koneksi WA siap...").then(()=>menu())
    
    clr(); console.log(BANNER); console.log("-- STEP 1")
    let num = (await ask("NUMBER: ")).replace(/[^0-9]/g, "")
    if (num.startsWith("0")) num = "62" + num.slice(1)
    if (num.startsWith("8")) num = "62" + num

    console.log("\n-- STEP 2")
    try {
        const code = await sock.requestPairingCode(num, config.customPairingCode)
        console.log(`CODE: \x1b[33m${code}\x1b[0m`)
    } catch (e) { 
        console.log(e.message); await slp(1500); menu() 
    }
}

async function select() {
    clr(); console.log(BANNER); console.log("[*] Fetching...\n")
    try {
        const grp = Object.values(await sock.groupFetchAllParticipating())
        if (!grp.length) return slp(1500).then(menu)
        
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
        await slp(1500); menu()
    } catch (e) { 
        console.log(e.message); await slp(1500); menu() 
    }
}

async function spam() {
    clr(); console.log(BANNER); console.log(`[TGT] ${tgtName} (${tgt.length})\n`)
    
    const txt = config.spamText
    if (!txt) return slp(1500).then(menu)

    let img = null
    if (config.imagePath && fs.existsSync(config.imagePath)) img = fs.readFileSync(config.imagePath)

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
                console.log(`[${new Date().toLocaleTimeString()}] Sent: ${++cnt} (${i+1}/${tgt.length})`)
            } catch (e) { 
                console.log(`[${new Date().toLocaleTimeString()}] Fail: ${e.message}`) 
            }
            if (tgt.length > 1) await slp(3000)
        }
        if (spamming) timer = setTimeout(loop, config.cooldownSeconds * 1000)
    }
    loop()
}

async function connect() {
    clr(); console.log("[*] Menghubungkan ke WhatsApp...\n")
    
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
    const { version } = await fetchLatestBaileysVersion()
    isPaired = state.creds.registered

    sock = makeWASocket({
        version, logger, printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: ["Ubuntu", "Chrome", "122.0.0.0"], syncFullHistory: false,
        getMessage: async () => ({ conversation: 'pong' })
    })

    sock.ev.on("creds.update", saveCreds)
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut ? connect() : process.exit(1)
        } else if (connection === "open") {
            isPaired = true; 
            // Jangan panggil menu() di sini jika lu gak mau ke-refresh pas lagi di tengah jalan
        }
    })

    // Langsung panggil menu setelah socket dibuat, tanpa nunggu 'open'
    setTimeout(menu, 1000)
}

connect()
