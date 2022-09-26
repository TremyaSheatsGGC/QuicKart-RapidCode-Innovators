const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ObjectID } = require('mongodb');
const dotenv = require('dotenv');
const Db = require('mongodb/lib/db');
const { assertValidSDLExtension } = require('graphql/validation/validate');

dotenv.config();
const { DB_URI, DB_NAME} = process.env;

const typeDefs = gql`
    type Query {
      getItem (
        id:ID!,
        name:String!,
      ):Item

      getInventory (id: Int!): [Item]!

      getAisle (id:ID!): Aisle

      getMap(id: ID!): StoreMap

      getAllMapCoords(id: ID!): [[Int]]
    }
    
    type Item{
      id:ID!,
      name:String!,
      aisle:String!,
      bay:String!,
      price:Float!,
      xVal:Int!,
      yVal:Int!
    }

    type Aisle{
      id: ID!,
      number: Int!,
      name:String!,
      bays:[[Int]!]!,
      xStartVal:Int!,
      xEndVal:Int!,
      yStartVal:Int!,
      yEndVal:Int!
    }

    type StoreMap {
      id: ID!,
      title: String!
      description: String,
      aisle: [Aisle!]!,
      checkout: [Checkout!]!
      width: Int!,
      length: Int!
    }

    type Checkout {
      lane: Int!,
      xStartVal:Int!,
      xEndVal:Int!,
      yStartVal:Int!,
      yEndVal:Int!
    }

    type Inventory {
      id: Int!
      title: String!
      items: [Item]!
    }
    
    type Mutation {
      createInventory(id: Int!, title: String!): Inventory!

      createItem(name: String!, 
        aisle: String!
      ): Item!

      createAisle(
        number: Int!
        name: String!, 
        xStartVal: Int!, 
        xEndVal: Int!, 
        yStartVal: Int!,
        yEndVal: Int!
      ): Aisle!

      createCheckout(
        lane: Int!,
        xStartVal:Int!,
        xEndVal:Int!,
        yStartVal:Int!,
        yEndVal:Int!
      ): Checkout!

      createMap(title: String!, 
        description: String!, 
        width: Int!, 
        length: Int!
      ): StoreMap!
    }
`;


const resolvers = {
  Query:  {
    getInventory: async (_, { id }, { db }) => {
      const inventory =  await db.collection('Inventory').findOne( {id: id });
      const items = inventory.items;
      return items
    },

    getItem: async (_, { id }, { db }) => {
      return await db.collection('Item').findOne({ _id: ObjectID(id) });
    },

    getAisle: async(_, { id }, { db }) => {
      return await db.collection('Aisles').findOne({ _id: ObjectID(id) });
    },

    getMap: async (_, { id }, { db }) => {
      return await db.collection('Map').findOne({ _id: ObjectID(id) });
    },

    getAllMapCoords: async (_, { id }, { db}) => {
        if(!await db.collection('Map').findOne({ _id: ObjectID(id) })) {
            throw new Error('Map not found');
        }
        const data = [];
        for(let x = 0; x < width; x++) {
            for(let y = 0; y < length; y++) {
                data.push([x,y]);
            }        
        }
        return data;
    },

  },
  Mutation: {
    createInventory: async(_, { title, id }, { db }) => {
      const currItems = await db.collection('Item').find().toArray();
      const newInventory = {
        id: id,
        title: title,
        items: currItems
      }

      const result = await db.collection('Inventory').insert(newInventory);

      return result.ops[0]
    },

    createAisle: async(_, { number, name, xStartVal, xEndVal, yStartVal, yEndVal }, { db }) => {

      const width = (xEndVal - xStartVal) + 1;
      const length = (yEndVal - yStartVal) + 1;

      // bays are not unique identifiers like aisles
      // three bays per aisle
      const horizonBayLength = width/3; 
      const vertBayLength = length/3;

      // 1st bay starts = startVal
      // 1st bay ends = starts + (bay length - 1)
      const bayCoordinates = [];
      if( width > length ) {
        for(let i = 0; i <= width; i++) {
          if (i == horizonBayLength) {

            const horizonFirstBayEnd = xStartVal + (i - 1);
            bayCoordinates.push([xStartVal,horizonFirstBayEnd]);

          } else if (i == (horizonBayLength*2)) {
            
            const horizonSecondBay = xStartVal + (horizonBayLength);
            const horizonSecondBayEnd = xStartVal + (i - 1);
            bayCoordinates.push([horizonSecondBay,horizonSecondBayEnd]);

          } else if (i == (horizonBayLength*3)) {

            const horizonThirdBay = xStartVal + (horizonBayLength*2);
            const horizonThirdBayEnd = xEndVal;
            bayCoordinates.push([horizonThirdBay,horizonThirdBayEnd]);

          }
        }
      } else {

      const newAisle = {
        number,
        name,
        bays: bayCoordinates,
        xStartVal,
        xEndVal,
        yStartVal,
        yEndVal
      }

      // insert newAisle object into database
      const result = await db.collection('Aisles').insert(newAisle);
      return result.ops[0];
    }
  },

    createMap: async (_, { title, description, width, length }, { db }) => { 

    if(await db.collection('Map').findOne({ title: title })) { throw new Error('Map already exists') }

    if(!(width > 0 && length > 0)) { throw new Error('Invalid map dimensions. Must have an area of at least 1 unit') }

    const aisles = await db.collection('Aisles').find().toArray();
    const checkoutLanes = await db.collection('Checkout').find().toArray();

    const validateRange = (x, y, min, max) => {
      return x >= min && y <= max
    }

    aisles.forEach(aisle => {
      if(!(validateRange(aisle.xStartVal, aisle.xEndVal, 0, width)
          && validateRange(aisle.yStartVal, aisle.yEndVal, 0, length))) { 
            throw new Error(`Aisle dimensions exceed map dimensions`)
          }
    });

    checkoutLanes.forEach(cLane => {
      if(!(validateRange(cLane.xStartVal, cLane.xEndVal, 0, width)
          && validateRange(cLane.yStartVal, cLane.yEndVal, 0, length))) { 
            throw new Error(`Checkout lane dimensions exceed map dimensions`)
          }
    });
    
    const newMap = {
      title,
      description,
      width,
      length,
      aisle: aisles,
      checkout: checkoutLanes
    }
    
    const result = await db.collection('Map').insert(newMap);

    return result.ops[0]
    },

    createCheckout: async(_, { lane, xStartVal, xEndVal, yStartVal, yEndVal } , { db }) => {
      const newLane = {
        lane,
        xStartVal,
        xEndVal,
        yStartVal,
        yEndVal
      }
      
      const result = await db.collection('Checkout').insert(newLane);

      return result.ops[0]
    },
  },

  // did this so then Aisle.id in Apollo wouldn't give an error for non-nullable fields
  Aisle: {
    id: ({ _id, id }) => _id || id,  
  },

  Item: {
    id: ({ _id, id }) => _id || id,  
  },
  
  StoreMap: {
    id: ({ _id, id }) => _id || id,
  },
};

const start = async () => {
  const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DB_NAME); // defines the database

  const context = {
    db,
  }
  const server = new ApolloServer({
      typeDefs,
      resolvers,
      context,
      introspection: true
  }); 
  
  // The `listen` method launches a web server.
  server.listen().then(({ url }) => {
      console.log(`🚀  Server ready at ${url + 'quickkart'}`);
  });
}

start();