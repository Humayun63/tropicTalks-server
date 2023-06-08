const express = require('express')
const app = express()
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors')
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())

// JWT Verify

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }

    const token = authorization.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next()
    })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nucgrat.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db('tropicTalks').collection('users')
        const classCollection = client.db('tropicTalks').collection('classes')
        const selectedCollection = client.db('tropicTalks').collection('selectedClasses')


        // Create JWT Token
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_KEY, { expiresIn: '1h' })
            res.send({ token })
        })


        // class related apis
        app.get('/classes', async (req, res) => {
            const query = { status: "approved" }
            const result = await classCollection.find(query).toArray()
            res.send(result)
        })


        app.get('/select', verifyJWT, async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([])
            }

            const decodedEmail = req.decoded.email
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden Access' })
            }
             const query = {email: email}
             const result = await selectedCollection.find(query).toArray()
             res.send(result)
        })

        app.post('/select', async (req, res) => {
            const selectedClass = req.body;
            const query = {classId: selectedClass._id}
            
            const isExist = await selectedCollection.findOne(query)
            if(isExist){
                return res.send('exists')
            }

            const result = await selectedCollection.insertOne(selectedClass)
            res.send(result)
        })

        // user related apis
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }

            const loggedUser = await usersCollection.findOne(query)
            if (loggedUser) {
                return res.send({ message: 'Already Exits' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Tropic is Talking!')
})

app.listen(port, () => {
    console.log(`TropicTalks is talking with port ${port}`)
})
