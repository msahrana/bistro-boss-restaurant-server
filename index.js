const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.crgl3kb.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const menuCollection = client.db("bistroDB").collection("menu");
    const userCollection = client.db("bistroDB").collection("users");
    const reviewCollection = client.db("bistroDB").collection("reviews");
    const cartCollection = client.db("bistroDB").collection("carts");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // jwt related
    const verifyToken = (req, res, next) => {
      if(!req.headers.authorization){
        return res.status(401).send({massage: 'unauthorized access'})
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(err){
          return res.status(401).send({massage: 'unauthorized access'})
        }
        req.decoded = decoded
        next()
      })
    }

  //  admin check
    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email
      const query = {email: email}
      const user = await userCollection.findOne(query)
      const isAdmin = user?.role === 'admin'
      if(!isAdmin){
        return res.status(403).send({massage: 'forbidden access'})
      }
      next()
    }

    app.post('/jwt', async(req, res) => {
      const user = req.body 
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'})
      res.send({token})
    })

     // users related
     app.get('/users',verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
     })

     app.get('/users/admin/:email', verifyToken, async(req, res) => {
      const email = req.params.email 
      if (email !== req.decoded.email) {
        return res.status(403).send({massage: 'forbidden access'})
      }
      const query = {email: email}
      const user = await userCollection.findOne(query)
      let admin = false 
      if (user) {
        admin = user?.role === 'admin'
      }
      res.send({ admin })
     })

     app.post('/users', async(req, res) => {
      const user = req.body 
      // user check
      const query = {email: user.email}
      const existingUser = await userCollection.findOne(query)
      if(existingUser){
        return res.send({massage: 'user already exists', insertedId: null})
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
     })

     app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id 
      const filter = {_id: new ObjectId(id)}
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result)
     })

     app.delete('/users/:id',verifyToken, verifyToken, async(req, res) => {
      const id = req.params.id 
      const query = {_id : new ObjectId(id)}
      const result = await userCollection.deleteOne(query)
      res.send(result)
     })

    // menu related
    app.get('/menu', async(req, res) => {
        const result = await menuCollection.find().toArray()
        res.send(result)
    })

    app.get('/menu/:id', async(req, res) => {
      const id = req.params.id 
      const query = {_id : new ObjectId(id)}
      const result = await menuCollection.findOne(query)
      res.send(result)
    })

    app.post('/menu', verifyToken, verifyAdmin, async(req, res) => {
      const item = req.body 
      const result = await menuCollection.insertOne(item)
      res.send(result)
    })

    app.patch('/menu/:id', async(req, res) => {
      const item = req.body 
      const id = req.params.id 
      const filter = {_id : new ObjectId(id)}
      const updatedDoc = {
        $set: {
          name: item.name, 
          category: item.category, 
          price: item.price, 
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id 
      const query = {_id : new ObjectId(id)}
      const result = await menuCollection.deleteOne(query)
      res.send(result)

    })

    // reviews related
    app.get('/reviews', async(req, res) => {
        const result = await reviewCollection.find().toArray()
        res.send(result)
    })

    // carts related
    app.get('/carts', async(req, res) => {
      const email = req.query.email
      const query = {email: email}
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/carts', async(req, res) => {
      const cartItem = req.body 
      const result = await cartCollection.insertOne(cartItem)
      res.send(result)
    })

    app.delete('/carts/:id', async(req, res) => {
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })

    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent')
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/payments', async(req, res) => {
      const payment = req.body 
      const paymentResult = await paymentCollection.insertOne(payment)
      console.log('payment info', payment)
      const query = {_id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }}
      const deleteResult = await cartCollection.deleteMany(query)
            // send user email about payment confirmation letter
            mg.messages
            .create(process.env.MAIL_SENDING_DOMAIN, {
              from: "Mailgun Sandbox <postmaster@sandboxbdfffae822db40f6b0ccc96ae1cb28f3.mailgun.org>",
              to: ["jhankarmahbub7@gmail.com"],
              subject: "Bistro Boss Order Confirmation",
              text: "Testing some Mailgun awesomness!",
              html: `
                <div>
                  <h2>Thank you for your order</h2>
                  <h4>Your Transaction Id: <strong>${payment.transactionId}</strong></h4>
                  <p>We would like to get your feedback about the food</p>
                </div>
              `
            })
            .then(msg => console.log(msg)) 
            .catch(err => console.log(err)); 
      res.send({paymentResult, deleteResult})
    })

       // stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      // not best
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);
      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

       // using aggregate pipeline
    app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection.aggregate([
        {
          $unwind: '$menuItemIds'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();
      res.send(result);
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);


app.get('/', (req, res)=>{
    res.send('Bistro Boss server is running')
})

app.listen(port, ()=>{
    console.log(`Bistro Boss Restaurant server is running on port: ${port}`)
})