const { Client, Buttons, MessageMedia} = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const port = process.env.PORT || 8000;
const { phoneNumberFormatter } = require('./helpers/formatter');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_FILE_PATH = './session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

const client = new Client({ 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
          ],
    }, 
    session: sessionCfg 
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if (msg.body == '!buttons') {
        let button = new Buttons('Button body', [{ body: 'bt1' }, { body: 'bt2' }, { body: 'bt3' }], 'title', 'footer');
        client.sendMessage(msg.from, button);
    }
});

client.initialize();

// socket
io.on('connection', function (socket) {
    socket.emit('message', 'Connection...');

    client.on('qr', (qr) => {
        // Generate and scan this code with your phone
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code Received, scan please...');
        })

    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is ready');
        socket.emit('message', 'Whatsapp is ready');
    });

    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Whatsapp is authenticated');
        socket.emit('message', 'Whatsapp is authenticated');
        console.log('AUTHENTICATED', session);
        sessionCfg = session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        })
    })
});

const checkRegisterNumber = async function(number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}

app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
],async (req, res) => {
    const errors = validationResult(req).formatWith(({msg}) => {
        return msg;
    });

    if(!errors.isEmpty()) {
         return res.status(422).json({
             status: false,
             message: errors.mapped()
         })
    }
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisterNumber(number);
    
    if(!isRegisteredNumber) {
        return res.status(422).json({
            status: false,
            message: 'The number is not registered'
        })
    }

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status: true,
            response: response
        })
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

app.post('/send-media', (req, res) => {

    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const media = MessageMedia.fromFilePath('./medal.png');

    client.sendMessage(number, media, {caption: caption}).then(response => {
        res.status(200).json({
            status: true,
            response: response
        })
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

server.listen(port, function () {
    console.log('App running on :' + port)
})