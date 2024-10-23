"use strict";
// ======================================================================
/**
 * Database name
 */
const database = 'mock_data';
const excludeCollections = [];
const isDeleteAfterArchive = false;
/**
 * Backup configuration
 */
const config = {
    // How month long we need to keep on MongoDB before we can archive to S3
    monthRentention: 3,
    // The field we need to compare to dataRentention
    timeField: 'A_COMMIT_TIMESTAMP',
    isTimeFieldIsString: true,
    // The time granularity we need to compare to dataRentention
    // The value can be 'day', 'month', 'year'
    timeGanularity: 'day',
};
/**
 * Sink S3 configuration
 */
const sinkS3Config = {
    bucket: 'my-bucket',
    filename: 'my-filename',
    format: {
        name: 'bson.gz',
    }
};
// ======================================================================
// Custom the filter
const isCustomTimeRange = false;
const start = null;
const end = null;
/**
 * Generate the folder structure based on the time granularity
 *
 * @param timestamp
 * @returns
 */
function generateFolderStructure(timestamp, db, coll, customFolderStructure = (db, coll) => `${db}/${coll}`) {
    const folders = [customFolderStructure(db, coll)];
    const ts = new Date(timestamp);
    switch (config.timeGanularity) {
        case 'day':
            folders.push(ts.getFullYear().toString());
            // month is lower than 10, we need to add 0 in front of it
            folders.push((ts.getMonth() + 1).toString().padStart(2, '0'));
            folders.push(ts.getDate().toString().padStart(2, '0'));
            break;
        case 'month':
            folders.push(ts.getFullYear().toString());
            folders.push((ts.getMonth() + 1).toString().padStart(2, '0'));
            break;
        case 'year':
            folders.push(ts.getFullYear().toString());
            break;
    }
    return folders.join('/');
}
const batches = [];
function generateArchiveQueryToS3(database, _excludeCollections = excludeCollections, customFolderStructure) {
    use(database);
    const collections = db.getSiblingDB(database)
        .getCollectionNames()
        .filter((collection) => !_excludeCollections.includes(collection));
    for (const collection of collections) {
        const pipeline = [];
        /**
         * Generate the query to archive the data to S3
         *
         * @param database
         * @param collection
         * @returns
         */
        function generateQuery(startMonth, endMonth) {
            // Mid night of first day of the month
            let startDate = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
            // End of last month
            let endDate = new Date(startDate.getFullYear(), startDate.getMonth() + config.monthRentention, 0);
            if (endMonth) {
                endDate = new Date(endMonth.getFullYear(), endMonth.getMonth());
            }
            if (isCustomTimeRange) {
                if (start !== null) {
                    startDate = new Date(start);
                }
                if (end !== null) {
                    endDate = new Date(end);
                }
                else {
                    endDate = new Date(startDate.getFullYear(), startDate.getMonth() + config.monthRentention, 0);
                }
            }
            else {
            }
            let query = {
                [config.timeField]: {
                    $lt: `ISODate('${endDate.toISOString()}')`,
                    $gte: `ISODate('${startDate.toISOString()}')`,
                },
            };
            if (config.isTimeFieldIsString) {
                query = {
                    [config.timeField]: {
                        $lt: `${endDate.getFullYear()}-${endDate.getMonth() + 1}-${endDate.getDate()}`,
                        $gte: `${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}`,
                    },
                };
            }
            return {
                query,
                startDate,
                endDate,
            };
        }
        // Generate the query
        const { startDate, endDate, query } = generateQuery(new Date());
        pipeline.push({ $match: query });
        function getYMD(date) {
            return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        }
        // Generate the folder structure
        const folderStructure = generateFolderStructure(startDate, database, collection, customFolderStructure);
        const fileName = `${folderStructure}/${collection}_${getYMD(startDate)}_${getYMD(endDate)}.${sinkS3Config.format.name}`;
        // $out to S3
        pipeline.push({
            $out: {
                s3: Object.assign(Object.assign({}, sinkS3Config), { filename: fileName }),
            }
        });
        batches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}").aggregate(${JSON.stringify(pipeline).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')});`);
        // Delete the data after archive
        if (isDeleteAfterArchive) {
            batches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}").deleteMany({query:${JSON.stringify(query).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')}});`);
        }
    }
    const results = batches.map((batch, index) => {
        console.log(`Running batch ${index + 1}...`);
        return batch();
    });
    console.log('----------------------------------------');
    console.log('Done!');
    console.log('----------------------------------------');
    function printSummary() {
        console.log(`Database: ${database}`);
        console.log(`Collections: ${collections.join(', ')}`);
        console.log(`Time granularity: ${config.timeGanularity}`);
        console.log(`Time field: ${config.timeField}`);
        console.log(`Delete after archive: ${isDeleteAfterArchive}`);
    }
    printSummary();
    console.log('----------------------------------------');
    console.log();
    console.log();
    console.log('Result:');
    console.log();
    console.log('=========================================');
    results.forEach((result) => console.log(result));
    console.log('=========================================');
    console.log();
    console.log();
    return results;
}
/**
 * Archive databases mapping
 * This function will archive all collections in the database by default
 *
 * The first element is the database name
 * The second element is the collections to Exclude
 * The third element is the custom folder structure function
 */
const archiveDatabases = [
    ['VirtualDatabase0', ['VirtualCollection0'], (db, coll) => `GROUP/${db}/${coll}`],
];
function startArchive() {
    for (const [db, colls, folder] of archiveDatabases) {
        generateArchiveQueryToS3(db, colls, folder);
    }
}
startArchive();
// ======================================================================
// Warning: The delete after archive is enabled
if (isDeleteAfterArchive) {
    console.log();
    console.log('################################################');
    console.log('# Warning: The delete after archive is enabled #');
    console.log('################################################');
}
