const databases = {
  RAW_ITML_ARC: [
    'sbc.raw.itmlt.asid1711sb.zasibl0p',
    'sbc.raw.itmlt.asid1711sb.znodct0p',
    'sbc.raw.itmlt.asid1711sb.ztahst0p',
    'sbc.raw.itmlt.asid1711sb.ztrans0p',
    'sbc.raw.itmlt.asid1711sb.zttypr0p'
  ],
  BIAN_ITML_ARC: [
    'SBC.EVENT.ITMLT.BIAN.ZASIBL0P_ACCOUNTBALANCE',
    'SBC.EVENT.ITMLT.BIAN.ZNODCT0P_NODECONTROL',
    'SBC.EVENT.ITMLT.BIAN.ZTAHST0P_TRANSACTIONAUTHORIZATIONHISTORY',
    'SBC.EVENT.ITMLT.BIAN.ZTRANS0P_ONLINETRANSACTION',
    'SBC.EVENT.ITMLT.BIAN.ZTTYPR0P_TRANSACTIONTYPEMASTER'
  ]
}

// Function to generate random mock data
const generateMockData = (db, coll, type) => {
    const getRandomDate = () => {
        const date = new Date(
            Date.UTC(
                Math.floor(Math.random() * (2022 - 2024 + 1)) + 2022,
                Math.floor(Math.random() * 12),
                Math.floor(Math.random() * 28) + 1,
                Math.floor(Math.random() * 24),
                Math.floor(Math.random() * 60),
                Math.floor(Math.random() * 60),
                Math.floor(Math.random() * 1000)
            )
        );
        return date.toISOString().replace("T", " ").replace("Z", "");
    };

    return {
        type,
        A_COMMIT_TIMESTAMP: getRandomDate(),
        db,
        coll,
    };
};

// Insert mock data into a specified database
// const insertMockData = async (dbName, data) => {
//     try {
//         await client.connect();
//         const db = client.db(dbName);
//         const collection = db.collection('mock_data');
//         await collection.insertMany(data);
//         console.log(`Inserted ${data.length} documents into ${dbName}`);
//     } catch (err) {
//         console.error(err);
//     } finally {
//         await client.close();
//     }
// };

// Insert data in parallel into multiple databases
const runInParallel = async () => {
    // const types = ["BIAN", "RAW"];
    // const getRandomType = () => types[Math.floor(Math.random() * types.length)];
    // const data = Array.from({ length: 10000 }, () => generateMockData(getRandomType()));

    // Separate data based on type
    // const bianData = data.filter(doc => doc.type === "BIAN");
    // const rawData = data.filter(doc => doc.type === "RAW");

    const tasks = []

    // databases.BIAN_ITML_ARC
    //   .forEach((coll) => {
    //     console.log(coll)
    //     const data = Array.from({ length: 10000 }, () => generateMockData("BIAN_ITML_ARC", coll, "BIAN"));

    //     db.getSiblingDB('BIAN_ITML_ARC')
    //         .getCollection(coll)
    //         .insertMany(data);
    //     // tasks.push(new Promise(async (resolve) => {
    //     //   await db.getSiblingDB('BIAN_ITML_ARC')
    //     //     .getCollection(coll)
    //     //     .insertMany(data);
    //     //   resolve();
    //     // }))
    //   });


    databases.RAW_ITML_ARC
      .forEach((coll) => {
        const data = Array.from({ length: 10000 }, () => generateMockData("RAW_ITML_ARC", coll, "RAW"));
        db.getSiblingDB('RAW_ITML_ARC')
            .getCollection(coll)
            .insertMany(data);

        // tasks.push(new Promise(async (resolve) => {
        //   await db.getSiblingDB('RAW_ITML_ARC')
        //     .getCollection(coll)
        //     .insertMany(data);
        //   resolve();
        // }))
      });

    // Insert into db_BIAN and db_RAW in parallel
    // await Promise.all([
    //     insertMockData('BIAN_ITML_ARC', bianData),
    //     insertMockData('RAW_ITML_ARC', rawData)
    // ]);
    // await Promise.all(tasks);

    console.log('Data insertion completed.');
};

runInParallel();