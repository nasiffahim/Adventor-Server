const express = require('express');
const cors = require('cors');
const app = express();
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.tur8sdy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Add Stripe configuration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//Middlware
app.use(cors());
app.use(express.json());
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}-${file.originalname}`);
//   },
// });

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 32 * 1024 * 1024, // 32MB limit (ImgBB's limit)
  }
});

// const upload = multer({ storage: storage });

// const storyStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/stories'); // Save in uploads/stories
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = `${Date.now()}-${file.originalname}`;
//     cb(null, uniqueName);
//   },
// });
// const uploadStories = multer({ storage: storyStorage });


// Function to upload image to ImgBB
async function uploadToImgBB(fileBuffer, filename) {
  try {
    const base64Image = fileBuffer.toString('base64');
    
    const formData = new FormData();
    formData.append('image', base64Image);
    formData.append('name', filename);

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data.url;
  } catch (error) {
    console.error('Error uploading to ImgBB:', error.response?.data || error.message);
    throw new Error('Failed to upload image to ImgBB');
  }
}



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

    const packagesCollection = client.db("tourismManagementSystemDB").collection("packages");

    app.post('/add-package', upload.array('images'), async (req, res) => {
      try {
        const formData = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
          return res.status(400).send({ message: "No images provided" });
        }

        // Upload all images to ImgBB
        const imageUploadPromises = files.map(async (file) => {
          const filename = `${Date.now()}-${file.originalname}`;
          return await uploadToImgBB(file.buffer, filename);
        });

        const imageUrls = await Promise.all(imageUploadPromises);

        const newPackage = {
          packageName: formData.packageName,
          location: formData.location,
          price: parseFloat(formData.price),
          about: formData.about,
          tourPlan: JSON.parse(formData.tourPlan),
          images: imageUrls,
        };

        const result = await packagesCollection.insertOne(newPackage);
        res.send(result);
      } catch (error) {
        console.error("Error adding package:", error);
        res.status(500).send({ message: "Failed to add package", error: error.message });
      }
    });


    app.get('/packages', async (req, res) => {
        const query = {};
        const cursor = packagesCollection.find(query);
        const packages = await cursor.toArray();
        res.send(packages);
    })
    
    app.get('/packages/random', async (req, res) => {
      try {
        const randomPackages = await packagesCollection.aggregate([
          { $sample: { size: 3 } }
        ]).toArray();
        res.send(randomPackages);
      } catch (error) {
        console.error('Error fetching random packages:', error);
        res.status(500).send({ message: 'Server Error' });
      }
    });




    app.get('/packages/:id', async (req, res) => {
      const id = req.params.id;

      try {
        const packageDetails = await packagesCollection.findOne({ _id: new ObjectId(id) });

        if (!packageDetails) {
          return res.status(404).json({ message: 'Package not found' });
        }

        res.send(packageDetails);
      } catch (error) {
        console.error('Error fetching package by ID:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
      }
    });

    const userCollection = client.db("tourismManagementSystemDB").collection("users");

    app.post("/users", async (req, res) => {
        const user = req.body;
        const existingUser = await userCollection.findOne({ email: user.email });
        if (existingUser) {
          return res.status(409).send({ message: "User already exists" });
        }

        const result = await userCollection.insertOne(user);
        res.send(result);
    });

    app.get('/all-users', async (req, res) => {
        const query = {};
        const cursor = userCollection.find(query);
        const users = await cursor.toArray();
        res.send(users);
    })

    app.get("/users/:email/role", async (req, res) => {
        const email = req.params.email;

        try {
          const user = await userCollection.findOne({ email });

          if (!user) {
            return res.status(404).send({ message: "No user found" });
          }

          res.send({ role: user.role || "tourist" });
        } catch (error) {
          console.error("Error fetching user role:", error);
          res.status(500).send({ error: "Internal server error" });
        }
    });

    app.patch('/users/role/:email', async (req, res) => {
        const email = req.params.email;
        const { role } = req.body;

        try {
          const result = await userCollection.updateOne(
            { email: email },
            { $set: { role: role } }
          );

          if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'User not found' });
          }

          res.send({ message: 'Role updated successfully' });
        } catch (error) {
          console.error('Error updating role:', error);
          res.status(500).send({ error: 'Internal server error' });
        }
    });

    const applicationCollection = client.db("tourismManagementSystemDB").collection("applications");

    app.post('/tour-guide-applications', async (req, res) => {
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    })

     app.get('/guide-applications', async (req, res) => {
        const query = {};
        const cursor = applicationCollection.find(query);
        const applications = await cursor.toArray();
        res.send(applications);
    })

    app.delete('/guide-applications/:id', async (req, res) => {
        const id = req.params.id;

        try {
          const result = await applicationCollection.deleteOne({ _id: new ObjectId(id) });

          if (result.deletedCount === 0) {
            return res.status(404).send({ message: 'Application not found' });
          }

          res.send({ message: 'Application deleted successfully' });
        } catch (error) {
          console.error('Error deleting application:', error);
          res.status(500).send({ error: 'Internal server error' });
        }
    });

    const storiesCollection = client.db("tourismManagementSystemDB").collection("stories");

    app.post('/add-story', upload.array('images'), async (req, res) => {
        try {
          const { title, text, email } = req.body;
          const files = req.files;

          if (!title || !text || !email || !files || files.length === 0) {
            return res.status(400).send({ message: "Missing required fields or files" });
          }

          // Upload all images to ImgBB
          const imageUploadPromises = files.map(async (file) => {
            const filename = `story-${Date.now()}-${file.originalname}`;
            return await uploadToImgBB(file.buffer, filename);
          });

          const imageUrls = await Promise.all(imageUploadPromises);

          const storyData = {
            title,
            text,
            email,
            images: imageUrls,
            createdAt: new Date(),
          };

          const result = await storiesCollection.insertOne(storyData);
          res.status(201).send({ message: "Story added successfully", result });
        } catch (error) {
          console.error("Error adding story:", error);
          res.status(500).send({ message: "Internal server error", error: error.message });
        }
    });



    app.get('/stories', async (req, res) => {
        const query = {};
        const cursor = storiesCollection.find(query);
        const stories = await cursor.toArray();
        res.send(stories);
    })

    

    // Fixed PATCH route for updating stories
    app.patch("/stories/:id", upload.array("images"), async (req, res) => {
      try {
        const { title, text, email } = req.body;
        const id = req.params.id;

        console.log("Request body:", req.body);
        console.log("All keys in req.body:", Object.keys(req.body));
        console.log("Files received:", req.files?.length || 0);

        // Get the current story to work with existing images
        const currentStory = await storiesCollection.findOne({ _id: new ObjectId(id) });
        if (!currentStory) {
          return res.status(404).send({ error: "Story not found" });
        }

        let updatedImages = [...currentStory.images]; // Start with existing images
        console.log("Original images:", updatedImages);

        // Handle image removal - check both possible field names
        let imagesToRemove = [];
        
        if (req.body.removeImages) {
          if (Array.isArray(req.body.removeImages)) {
            imagesToRemove = req.body.removeImages;
          } else {
            imagesToRemove = [req.body.removeImages];
          }
        } else if (req.body["removeImages[]"]) {
          if (Array.isArray(req.body["removeImages[]"])) {
            imagesToRemove = req.body["removeImages[]"];
          } else {
            imagesToRemove = [req.body["removeImages[]"]];
          }
        }

        console.log("Images to remove:", imagesToRemove);

        // Remove images from the array
        if (imagesToRemove.length > 0) {
          updatedImages = updatedImages.filter(img => !imagesToRemove.includes(img));
          console.log("Images after removal:", updatedImages);
        }

        // Handle new image uploads to ImgBB
        let newImages = [];
        if (req.files && req.files.length > 0) {
          const imageUploadPromises = req.files.map(async (file) => {
            const filename = `story-update-${Date.now()}-${file.originalname}`;
            return await uploadToImgBB(file.buffer, filename);
          });
          newImages = await Promise.all(imageUploadPromises);
        }

        console.log("New images to add:", newImages);

        // Add new images to the array
        if (newImages.length > 0) {
          updatedImages = [...updatedImages, ...newImages];
        }

        console.log("Final images array:", updatedImages);

        // Update the story with the new image array
        const updateQuery = {
          $set: {
            title,
            text,
            email,
            images: updatedImages,
            updatedAt: new Date(),
          },
        };

        const result = await storiesCollection.updateOne(
          { _id: new ObjectId(id) },
          updateQuery
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "Story not found" });
        }

        // Fetch the updated story to return
        const updatedStory = await storiesCollection.findOne({ _id: new ObjectId(id) });

        res.send({ 
          message: "Story updated successfully", 
          result,
          story: updatedStory,
          removedImages: imagesToRemove,
          addedImages: newImages
        });

      } catch (err) {
        console.error("Error updating story:", err);
        res.status(500).send({ error: "Failed to update story", details: err.message });
      }
    });


    app.delete("/stories/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await storiesCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
          res.send({ message: "Story deleted successfully", deletedCount: 1 });
        } else {
          res.status(404).send({ message: "Story not found", deletedCount: 0 });
        }
      } catch (error) {
        console.error("Error deleting story:", error);
        res.status(500).send({ message: "Failed to delete story", error: error.message });
      }
    });

    const bookingCollection = client.db("tourismManagementSystemDB").collection("bookings");

    // Backend API endpoint for storing bookings
    app.post('/bookings', async (req, res) => {
      try {
        const {
          packageName,
          touristName,
          touristEmail,
          touristImage,
          price,
          tourDate,
          selectedGuide
        } = req.body;

        // Validation
        if (!packageName || !touristName || !touristEmail || !price || !tourDate || !selectedGuide) {
          return res.status(400).json({
            success: false,
            message: 'All fields are required'
          });
        }

        // Create booking object with guide information
        const booking = {
          packageName,
          touristName,
          touristEmail,
          touristImage,
          price: parseFloat(price),
          tourDate: new Date(tourDate),
          tourGuide: {
            id: selectedGuide._id,
            name: selectedGuide.name,
            photo: selectedGuide.photo,
            email: selectedGuide.email
          },
          status: 'pending',
          bookingDate: new Date(),
          bookingId: `BK${Date.now()}`,
          paymentStatus: 'unpaid'
        };

        // Insert into database
        const result = await bookingCollection.insertOne(booking);

        if (result.insertedId) {
          res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: {
              _id: result.insertedId,
              ...booking
            }
          });
        } else {
          throw new Error('Failed to create booking');
        }

      } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }
    });

    // Get bookings by user email with guide information
    app.get('/bookings/user/:email', async (req, res) => {
      try {
        const { email } = req.params;
        
        const bookings = await bookingCollection
          .find({ touristEmail: email })
          .sort({ bookingDate: -1 })
          .toArray();

        res.json({
          success: true,
          data: bookings
        });

      } catch (error) {
        console.error('Error fetching user bookings:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }
    });

    // Cancel booking
    app.patch('/bookings/:id/cancel', async (req, res) => {
      try {
        const { id } = req.params;
        
        const result = await bookingCollection.updateOne(
          { _id: new ObjectId(id), status: 'pending' },
          { 
            $set: { 
              status: 'cancelled',
              cancelledAt: new Date()
            } 
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: 'Booking not found or cannot be cancelled'
          });
        }

        res.json({
          success: true,
          message: 'Booking cancelled successfully'
        });

      } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }
    });


    // GET endpoint to fetch assigned tours for a specific guide
    app.get('/assigned-tours/:guideEmail', async (req, res) => {
      try {
        const { guideEmail } = req.params;
        console.log('Received guide email in backend:', guideEmail);
        
        // Find all bookings assigned to this tour guide
        const assignedTours = await bookingCollection.find({
          "tourGuide.email": guideEmail
        }).toArray();
        
        res.status(200).json({
          success: true,
          data: assignedTours
        });
      } catch (error) {
        console.error('Error fetching assigned tours:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch assigned tours'
        });
      }
    });

    // PUT endpoint to update tour status (Accept/Reject)
    app.put('/assigned-tours/:bookingId/status', async (req, res) => {
      try {
        const { bookingId } = req.params;
        const { status } = req.body;
        
        // Validate status
        if (!['accepted', 'rejected'].includes(status.toLowerCase())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid status. Must be "accepted" or "rejected"'
          });
        }
        
        // Update the booking status
        const result = await bookingCollection.updateOne(
          { bookingId: bookingId },
          { 
            $set: { 
              status: status.toLowerCase(),
              updatedAt: new Date()
            } 
          }
        );
        
        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: 'Booking not found'
          });
        }
        
        res.status(200).json({
          success: true,
          message: `Tour ${status.toLowerCase()} successfully`
        });
      } catch (error) {
        console.error('Error updating tour status:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to update tour status'
        });
      }
    });

    // ========== STRIPE PAYMENT ROUTES ==========

    // Create payment intent for Stripe

    app.post('/payment/create-payment-intent', async (req, res) => {
      try {
        const { amount, bookingId, currency = 'usd' } = req.body;

        console.log('=== PAYMENT INTENT DEBUG ===');
        console.log('Request body:', { amount, bookingId, currency });
        console.log('Stripe key being used:', stripe.apiKey ? `${stripe.apiKey.substring(0, 12)}...` : 'NO KEY SET');

        // Validate required fields
        if (!amount || !bookingId) {
          return res.status(400).json({
            success: false,
            message: 'Amount and booking ID are required'
          });
        }

        // Try to find booking with proper ObjectId conversion
        let booking;
        try {
          booking = await bookingCollection.findOne({ 
            _id: new ObjectId(bookingId), 
            status: 'pending' 
          });
          console.log('Found booking by ObjectId:', booking ? 'YES' : 'NO');
        } catch (idError) {
          console.log('ObjectId conversion failed, trying bookingId field...');
          booking = await bookingCollection.findOne({ 
            bookingId: bookingId, 
            status: 'pending' 
          });
          console.log('Found booking by bookingId field:', booking ? 'YES' : 'NO');
        }

        if (!booking) {
          console.log('❌ No booking found for ID:', bookingId);
          return res.status(404).json({
            success: false,
            message: 'Booking not found or not eligible for payment'
          });
        }

        console.log('✅ Found booking:', booking._id);
        console.log('Amount in cents for Stripe:', Math.round(amount * 100));

        // Create payment intent with Stripe
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // Convert to cents for Stripe
          currency: currency,
          metadata: {
            bookingId: bookingId,
            touristEmail: booking.touristEmail,
            packageName: booking.packageName
          },
          automatic_payment_methods: {
            enabled: true,
          },
        });

        console.log('✅ Payment intent created successfully:');
        console.log('- Payment Intent ID:', paymentIntent.id);
        console.log('- Client Secret:', paymentIntent.client_secret ? 'Generated' : 'MISSING');
        console.log('- Status:', paymentIntent.status);
        console.log('=== END DEBUG ===');

        res.json({
          success: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        });

      } catch (error) {
        console.error('❌ ERROR creating payment intent:', error);
        console.error('Error details:', {
          message: error.message,
          type: error.type,
          code: error.code,
          decline_code: error.decline_code,
          param: error.param
        });
        
        res.status(500).json({
          success: false,
          message: 'Failed to create payment intent',
          error: error.message
        });
      }
    });

    // Also update your confirm-payment endpoint:
    app.post('/payment/confirm-payment', async (req, res) => {
        try {
          const { paymentIntentId, bookingId } = req.body;

          console.log('=== CONFIRM PAYMENT DEBUG ===');
          console.log('Request:', { paymentIntentId, bookingId });

          if (!paymentIntentId || !bookingId) {
            return res.status(400).json({
              success: false,
              message: 'Payment Intent ID and Booking ID are required'
            });
          }

          // Retrieve payment intent from Stripe with expanded charges
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['charges.data.payment_method_details']
          });
          console.log('Payment Intent Status:', paymentIntent.status);
          console.log('Charges available:', paymentIntent.charges?.data?.length || 0);

          if (paymentIntent.status === 'succeeded') {
            // First, let's find the booking
            let booking;
            try {
              console.log('Trying to find booking with ObjectId...');
              booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
              console.log('Found booking by ObjectId:', booking ? 'YES' : 'NO');
            } catch (idError) {
              console.log('ObjectId failed, trying bookingId field...');
              booking = await bookingCollection.findOne({ bookingId: bookingId });
              console.log('Found booking by bookingId field:', booking ? 'YES' : 'NO');
            }

            if (!booking) {
              console.log('❌ No booking found with ID:', bookingId);
              return res.status(404).json({
                success: false,
                message: 'Booking not found'
              });
            }

            console.log('✅ Found booking:', {
              _id: booking._id,
              bookingId: booking.bookingId,
              currentStatus: booking.status,
              touristEmail: booking.touristEmail
            });

            // Safely extract payment method details
            let paymentMethodDetails = null;
            let stripeChargeId = null;

            if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0) {
              const charge = paymentIntent.charges.data[0];
              paymentMethodDetails = charge.payment_method_details || null;
              stripeChargeId = charge.id || null;
              console.log('✅ Payment method details extracted');
            } else {
              console.log('⚠️ No charges data available, using payment method from intent');
              // Fallback: get payment method directly from payment intent
              if (paymentIntent.payment_method) {
                try {
                  const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
                  paymentMethodDetails = {
                    type: paymentMethod.type,
                    card: paymentMethod.card
                  };
                  console.log('✅ Payment method retrieved separately');
                } catch (pmError) {
                  console.log('⚠️ Could not retrieve payment method:', pmError.message);
                }
              }
            }

            // Create payment transaction record
            const paymentTransaction = {
              bookingId: bookingId,
              bookingObjectId: booking._id,
              paymentIntentId: paymentIntentId,
              amount: paymentIntent.amount / 100, // Convert from cents
              currency: paymentIntent.currency,
              status: 'succeeded',
              paymentMethod: paymentMethodDetails,
              paymentDate: new Date(),
              transactionId: `TXN${Date.now()}`,
              stripeChargeId: stripeChargeId,
              touristEmail: booking.touristEmail,
              packageName: booking.packageName
            };

            // Save payment transaction to payments collection
            const paymentsCollection = client.db("tourismManagementSystemDB").collection("payments");
            const paymentInsertResult = await paymentsCollection.insertOne(paymentTransaction);
            console.log('✅ Payment transaction saved:', paymentInsertResult.insertedId);

            // Update booking status
            const updateData = { 
              status: 'in review',
              paymentStatus: 'paid',
              paymentDate: new Date(),
              paymentTransactionId: paymentTransaction.transactionId,
              paymentIntentId: paymentIntentId,
              updatedAt: new Date()
            };

            let updateResult;
            try {
              console.log('Attempting to update booking with ObjectId...');
              updateResult = await bookingCollection.updateOne(
                { _id: new ObjectId(bookingId) },
                { $set: updateData }
              );
              console.log('Update result (ObjectId):', {
                matchedCount: updateResult.matchedCount,
                modifiedCount: updateResult.modifiedCount
              });
            } catch (idError) {
              console.log('ObjectId update failed, trying bookingId field...');
              updateResult = await bookingCollection.updateOne(
                { bookingId: bookingId },
                { $set: updateData }
              );
              console.log('Update result (bookingId field):', {
                matchedCount: updateResult.matchedCount,
                modifiedCount: updateResult.modifiedCount
              });
            }

            if (updateResult.matchedCount === 0) {
              console.log('❌ No booking matched for update');
              return res.json({
                success: true,
                warning: 'Payment succeeded but booking status update failed',
                message: 'Payment confirmed successfully',
                paymentStatus: paymentIntent.status,
                transactionId: paymentTransaction.transactionId,
                bookingUpdateFailed: true
              });
            }

            console.log('✅ Booking updated successfully');
            console.log('=== CONFIRM PAYMENT SUCCESS ===');

            res.json({
              success: true,
              message: 'Payment confirmed and booking updated successfully',
              paymentStatus: paymentIntent.status,
              transactionId: paymentTransaction.transactionId,
              paymentTransactionId: paymentInsertResult.insertedId
            });

          } else {
            console.log('❌ Payment not completed, status:', paymentIntent.status);
            res.status(400).json({
              success: false,
              message: 'Payment not completed',
              paymentStatus: paymentIntent.status
            });
          }

        } catch (error) {
          console.error('❌ Error confirming payment:', error);
          console.error('Error details:', {
            message: error.message,
            stack: error.stack
          });
          
          res.status(500).json({
            success: false,
            message: 'Failed to confirm payment',
            error: error.message
          });
        }
      });


      const paymentsCollection = client.db("tourismManagementSystemDB").collection("payments");

      app.get('/payments', async (req, res) => {
          const query = {};
          const cursor = paymentsCollection.find(query);
          const payments = await cursor.toArray();
          res.send(payments);
      })


    // Get payment history for a booking
    app.get('/payment/history/:bookingId', async (req, res) => {
      try {
        const { bookingId } = req.params;
        
        const paymentsCollection = client.db("tourismManagementSystemDB").collection("payments");
        const payments = await paymentsCollection
          .find({ bookingId: bookingId })
          .sort({ paymentDate: -1 })
          .toArray();

        res.json({
          success: true,
          data: payments
        });

      } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch payment history',
          error: error.message
        });
      }
    });

    // Get all payments


    // ========== END STRIPE PAYMENT ROUTES ==========

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Lets go on a tour!!!');
});

app.listen(port, () => {
  console.log(`Tourism server running on port ${port}`);
});