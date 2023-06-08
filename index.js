const express = require('express')
const app = express()
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const stripe = require('stripe')(process.env.PAYMENT_TOKEN)
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
        const enrolledCollection = client.db('tropicTalks').collection('enrolledClasses')
        const paymentCollection = client.db('tropicTalks').collection('payments')


        // Create JWT Token
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_KEY, { expiresIn: '1h' })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'Forbidden Access' })
            }
            next()
        }


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
            const query = { email: email }
            const result = await selectedCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/select', async (req, res) => {
            const selectedClass = req.body;

            const query = {
                $and: [
                    { classId: selectedClass.classId },
                    { email: selectedClass.email }
                ]
            }

            const isExist = await selectedCollection.findOne(query)

            if (isExist) {
                return res.send({ message: 'exists' })
            }

            const result = await selectedCollection.insertOne(selectedClass)
            res.send(result)
        })

        app.delete('/select/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const result = await selectedCollection.deleteOne(filter)
            res.send(result)
        })

        // enrolled classes apis
        app.get('/enrolled', verifyJWT, async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([])
            }

            const decodedEmail = req.decoded.email
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden Access' })
            }
            const query = { email: email }
            const result = await enrolledCollection.find(query).toArray()
            res.send(result)
        })

        // payment history apis
        app.get('/payment-history', verifyJWT, async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([])
            }

            const decodedEmail = req.decoded.email
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden Access' })
            }
            const query = { email: email }

            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();

            res.send(result)
        })

        // user related apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

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

        // make admin or instructor
        app.patch('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const role = req.body.role;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: role
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        // Check admin
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { admin: user?.role === 'admin' }
            res.send(result)
        })

        // check instructor
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { instructor: user?.role === 'instructor' }
            res.send(result)
        })


        // Create payment
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseFloat((price * 100).toFixed());
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related apis
        app.post('/payments', verifyJWT, async (req, res) => {
            // insert payment information
            const payment = req.body;
            const insertedResult = await paymentCollection.insertOne(payment);

            // Delete from selected classes
            const query = { _id: { $in: payment.selectedItemsIds.map(id => new ObjectId(id)) } };
            const deleteResult = await selectedCollection.deleteMany(query);

            // insert classes to enrolled
            const classIds = payment.classIds;
            console.log(classIds)
            const enrolledClasses = await classCollection.find({ _id: { $in: classIds.map((id) => new ObjectId(id)) } }).toArray()
            const enrolledClassesWithEmail = enrolledClasses.map((enrolledClass) => {
                return { ...enrolledClass, email: payment.email, classId: enrolledClass._id, _id: undefined };
            });

            const addEnroll = await enrolledCollection.insertMany(enrolledClassesWithEmail);

            // update available seats
            const updateClassesResult = await classCollection.updateMany(
                { _id: { $in: classIds.map((id) => new ObjectId(id)) } },
                { $inc: { available_seats: -1 } }
            );


            res.send({ insertedResult, deleteResult, addEnroll, updateClassesResult });
        });


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
