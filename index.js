import express from 'express'
import OpenAI from "openai"
import multer from "multer"
import path from "path"
import fs from 'fs'
import sharp from 'sharp'
import axios from "axios"
import { fileURLToPath } from 'url'
import crypto from "crypto"
import { MongoClient } from 'mongodb'
import Jimp from "jimp"

const client = new MongoClient(`YOUR_MONGO_AUTH_HERE`)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const openai = new OpenAI({apiKey: "YOUR_OPENAI_AUTH_HERE"})
const secretKey = '7OipRVtgBtpxyVkk'
const app = express()
app.use(express.static('./public'))
app.use(express.json())

const storage = multer.memoryStorage()
const upload = multer({ storage: storage }).single('img')

async function textOverlay(text, imageURL) {
	const image = await Jimp.read(imageURL)
	const response = await axios.get(imageURL, { responseType: 'arraybuffer' })
	const metadata = await sharp(response.data).metadata()
	for(let i = 0; i < text.length; i++) {
		const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK)
		image.print(font, text[i].left * metadata.width, text[i].top * metadata.height, text[i].text)
	}

	const outputPath = path.join(__dirname, "output")
	await fs.mkdir(outputPath, { recursive: true })

	await image.writeAsync(path.join(outputPath, `image-${Math.random()}.png`))
}

const dbCreate = async (collection, data) => {
	try {
		await client.connect()
		const db = client.db("main")
		await db.collection(collection).insertOne(data)
		return 1
	} catch(error) {
		return 0
	} finally {
		client.close()
	}
}

const dbGet = async (collection, query) => {
	try {
		await client.connect()
		const db = client.db("main")
		const result = await db.collection(collection).findOne(query)
		return result
	} catch(error) {
		return 0
	} finally {
		client.close()
	}
}

const dbUpdateSet = async (collection, query, data) => {
	try {
		await client.connect()
		const db = client.db("main")
		await db.collection(collection).updateOne(query, { $set: data})
		return 1
	} catch(error) {
		return 0
	} finally {
		client.close()
	}
}

async function answer(text) {
    const gptResponse = await openai.chat.completions.create({
        model: "gpt-4-0125-preview",
        max_tokens: 1500,
        messages: [
            {
                role: "user",
                content: `You are Answer Lens ai. People can upload images of questions that are written
                in text and you return the answers. Always double-check and make sure that the answer in the answer field is exactly correct,
                for example in a math question the answer turns out to be x = 1.5 make sure that is what you put in the answer field rather than x = 1
                or something different. Make sure that each question and sub question is answered as well as filling in any empty space.
                Ignore questions that require you to answer in something other than a text answer, so if it were to say sketch or draw. 
                When writing the explanation don't over explain the answer, rather, just give a simplified main idea of the explanation. 

                Here is the text that the image pulled for you to answer:
                ${text}
                `
            }
        ],
        functions: [
            {
                name: "generateAnswers",
                parameters: {
                    type: "object",
                    properties: {
                        answers: {
                            type: "array",
                            description: `This is an array of strings. There should be a string for each of the questions identified in the given prompt. 
                            Each string should be formatted in this specific way: question+-+answer+-+explanation. The question field contains a string of what the identified question 
                            was. Then the answer field contains what the answer to that question was. And finally the explanation field is a short and brief explanation 
                            on why the answer is what it is. 

                            Here is an example if the question was 2 + 2: 
                            ["What is 2 + 2?+-+4+-+Two plus two equals four."]
                            Make sure to seperate each section with a +-+
                            `,
                            items: {
                                type: "string"
                            }
                        }
                    },
                    required: ["answers"]
                }
            }
        ],
        function_call: { name: "generateAnswers" }
    })

    const functionCall = gptResponse.choices[0].message.function_call
    const json = JSON.parse(functionCall.arguments)
    let final = []

    for(let i = 0; i < json.answers.length; i++) {
        final.push({
            question: json.answers[i].split("+-+")[0],
            answer: json.answers[i].split("+-+")[1],
            explanation: json.answers[i].split("+-+")[2]
        })
    }

    return final
}

function generateKey(currentTimeMillis, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey)
    hmac.update(currentTimeMillis.toString())
    return hmac.digest('hex')
}

let time = Date.now()

console.log(time)
console.log(generateKey(time, secretKey))

let keyUses = []
function validateKey(receivedHmac, receivedTimeMillis, secretKey) {
    const currentTimeMillis = Date.now()
    const expectedHmac = generateKey(receivedTimeMillis, secretKey)
    let result = false

    if(receivedHmac === expectedHmac && currentTimeMillis - receivedTimeMillis <= 30000) {
        let used = false
        for(let i = 0; i < keyUses.length; i++) {
            if(keyUses[i].key == receivedHmac) {
                used = true
            }
        }

        if(used == false) {
            result = true
            keyUses.push({key: receivedHmac, time: receivedTimeMillis})
        }
    }

    return result
}

setInterval((e) => {
    for(let i = 0; i < keyUses.length; i++) {
        const currentTimeMillis = Date.now()
        keyUses = keyUses.filter(keyUse => currentTimeMillis - keyUse.time <= 30000)
    }
}, 60000)

app.get("/", (req, res) => {
    res.status(200).json({ success: true })
})

app.post('/usage', async (req, res) => {
    try {
        const id = req.body.id
        const user = await dbGet("users", {id: id})

        if(user) {
            res.status(200).json({ success: true, credits: user.credits })
        } else {
            await dbCreate("users", {
                id: req.body.id,
                credits: 5
            })

            res.status(200).json({ success: true, credits: 5 })
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error thrown in route.', error: error })
    }
})

app.post('/answer', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            res.status(500).json({ success: false, message: 'Error uploading the file.' })
        } else if (!req.file) {
            res.status(400).json({ success: false, message: 'No file provided.' })
        } else {
            const key = req.body.key || "-"
            const time = req.body.time || "-"
            const id = req.body.id
            if(id !== "-1" && id !== -1) {
                const user = await dbGet("users", {id: id})
                if(user) {
                    if(user.credits > 0) {
                        const updatedCredits = await dbUpdateSet("users", {id: id}, {
                            credits: user.credits - 1
                        })
                    } else {
                        res.status(500).json({ success: false, message: 'User does not have any free credits remaining, set id to -1 if they are a paid user.' })
                        return
                    }
                } else {
                    res.status(500).json({ success: false, message: 'Unknown deviceId, make sure to use the /usage route before.' })
                    return
                }
            }

            if(validateKey(key, time, secretKey)) {
                let imageId = Math.floor(Math.random() * 9999999)
                const outputPath = path.join(__dirname, 'public', 'uploads', `image-${imageId}.jpg`)
                sharp(req.file.buffer)
                    .toFile(outputPath, async (sharpError) => {
                        if (sharpError) {
                            res.status(500).json({ success: false, message: 'Error processing the image.' })
                        } else {
                            const imageUrl = `https://answer-lens.onrender.com/uploads/image-${imageId}.jpg`

                            const options = {
                                method: "POST",
                                url: "https://api.edenai.run/v2/ocr/ocr",
                                headers: {
                                    Authorization: "Bearer YOUR_BEARER_AUTH_HERE",
                                },
                                data: {
                                    providers: "google",
                                    language: "en",
                                    file_url: imageUrl,
                                    fallback_providers: "",
                                },
                            }

                            axios
	                            .request(options)
	                            .then(async (response) => {
                                    try {
                                        let final = await answer(response.data.google.text)
        
                                        fs.unlink(outputPath, (unlinkError) => {
                                            if (unlinkError) {
                                                console.error('Error deleting file:', unlinkError)
                                            }
                                        })
        
                                        res.status(200).json({
                                            success: true,
                                            final: final
                                         })
                                    } catch (apiError) {
                                        console.error("Error calling OpenAI:", apiError)
        
                                        fs.unlink(outputPath, (unlinkError) => {
                                            if (unlinkError) {
                                                console.error('Error deleting file:', unlinkError)
                                            }
                                        })
        
                                        res.status(500).json({ success: false, message: 'Error calling OpenAI API.', error: apiError })
                                    }
	                            })
                        }  
                    })      
            } else {
                res.status(400).json({ success: false, message: 'Key provided is either invalid, expired, or already used.' })
            }
        }
    })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
