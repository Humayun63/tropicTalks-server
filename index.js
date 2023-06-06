const express = require('express')
const app = express()
require('dotenv').config()
const jwt = require('jsonwebtoken')
const cors = require('cors')
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())


app.get('/', (req, res)=>{
    res.send('Tropic is Talking!')
})

app.listen(port, ()=>{
    console.log(`TropicTalks is talking with port ${port}`)
})
