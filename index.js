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
let sock, isPaired = false, selectedTargets = [], selectedTargetName = ""
let isSpamming = false, spamTimeout = null, rl

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

async function menu() {
    clr(); console.log(BANNER)
    console.log(isPaired ? `[1] Target: ${selectedTargetName || "None"}` : `[1] Target (Wait Pairing)`)
    if (!isPaired) console.log(`[2] Pairing Code`)
    console.log(`[3] Spam`)
    console.log(`[4] Exit\n`)

    const c = await ask("> ")
    if (c === "1") { if (!isPaired) return slp(1000).then(menu); select() }
    else if (c === "2") { if (isPaired) return slp(1000).then(menu); pair() }
    else if (c === "3") { if (!isPaired || !selectedTargets.length) return slp(1000).then(menu); spam() }
    else if (c === "4") process.exit(0)
    else menu()
}

async function pair() {
    clr(); console.log(BANNER)
    console.log("-- STEP 1")
    let num = (await ask("WHATSAPP NUMBER: ")).replace(/[^0-9]/g, "")
    if (num.startsWith("0")) num = "62" + num.slice(1)
    if (num.startsWith("8")) num = "62" + num

    console.log("\n-- STEP 2")
    try {
        const code = await sock.requestPairingCode(num, config.customPairingCode)
        console.log(`PAIRING CODE: \x1b[33m${code}\x1b[0m`)
        console.log("[!] Input to WA.")
    } catch (e) { console.log("[ERR]", e.message); await slp(2000); menu() }
}

async function select() {
    clr(); console.log(BANNER)
    console.log("[*] Fetching groups...\n")
    try {
        const groups = Object.values(await sock.groupFetchAllParticipating())
        if (!groups.length) { console.log("[ERR] No groups."); return slp(2000).then(menu) }

        groups.forEach((g, i) => console.log(`${i + 1}. ${g.subject || "Unknown"}${g.isCommunity ? " \x1b[33m[COMM]\x1b[0m" : ""}`))
        
        const input = await ask("\nExact Group Name: ")
        const found = groups.find(g => g.subject?.toLowerCase() === input.toLowerCase())

        if (found) {
            selectedTargetName = found.subject
            selectedTargets = [found.id]
            if (found.isCommunity) {
                groups.filter(g => g.linkedParent === found.id).forEach(sub => selectedTargets.push(sub.id))
            }
            console.log(`\n[+] Locked: ${found.subject} (${selectedTargets.length} targets)`)
        } else {
            console.log("\n[ERR] Not found.")
        }
        await slp(1500); menu()
    } catch (e) { console.log("[ERR]", e.message); await slp(2000); menu() }
}

async function spam() {
    clr(); console.log(BANNER)
    console.log(`[TARGET] ${selectedTargetName} (${selectedTargets.length})\n`)
    
    const txt = config.spamText
    if (!txt) { console.log("[ERR] No text."); return slp(1500).then(menu) }

    let img = null
    if (config.imagePath && fs.existsSync(config.imagePath)) {
        img = fs.readFileSync(config.imagePath)
        console.log(`[SYS] Mode: Image + Text`)
    } else {
        console.log(`[SYS] Mode: Text`)
    }

    console.log(`\n[ RUNNING - Ctrl+X to STOP ]\n`)
    isSpamming = true
    let count = 0

    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.on('keypress', (s, k) => { if (k?.ctrl && k?.name === 'x') stop() })

    const loop = async () => {
        if (!isSpamming) return
        for (let i = 0; i < selectedTargets.length; i++) {
            if (!isSpamming) break
            try {
                const payload = img ? { image: img, caption: txt } : { text: txt }
                await sock.sendMessage(selectedTargets[i], payload)
                console.log(`[${new Date().toLocaleTimeString()}] Sent: ${++count} (${i+1}/${selectedTargets.length})`)
            } catch (e) {
                console.log(`[${new Date().toLocaleTimeString()}] Fail: ${e.message}`)
            }
            if (selectedTargets.length > 1) await slp(3000)
        }
        if (isSpamming) spamTimeout = setTimeout(loop, config.cooldownMs)
    }
    loop()
}

function stop() {
    isSpamming = false
    clearTimeout(spamTimeout)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.removeAllListeners('keypress')
    process.stdin.pause()
    clr(); console.log(BANNER); console.log("\x1b[31m[ STOPPED ]\x1b[0m")
    setTimeout(menu, 1000)
}

async function connect() {
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
            const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            reconnect ? connect() : process.exit(1)
        } else if (connection === "open") {
            isPaired = true; setTimeout(menu, 1500)
        }
    })
    if (isPaired) setTimeout(() => sock.user && menu(), 3000)
}

connect()
