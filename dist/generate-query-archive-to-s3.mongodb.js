"use strict";
// ======================================================================
/**
 * Database name
 */
const database = '';
const excludeCollections = [];
/**
 * Backup configuration
 */
const config = {
    // How month long we need to keep on MongoDB before we can archive to S3
    monthRentention: 3,
    // The field we need to compare to dataRentention
    timeField: 'A_COMMIT_TIMESTAMP',
    // The time granularity we need to compare to dataRentention
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
function generateFolderStructure(timestamp) {
    const folders = [];
    const ts = new Date(timestamp);
    switch (config.timeGanularity) {
        case 'day':
            folders.push(ts.getFullYear().toString());
            folders.push((ts.getMonth() + 1).toString());
            folders.push(ts.getDate().toString());
            break;
        case 'month':
            folders.push(ts.getFullYear().toString());
            folders.push((ts.getMonth() + 1).toString());
            break;
        case 'year':
            folders.push(ts.getFullYear().toString());
            break;
    }
    return folders.join('/');
}
const batches = [];
function generateArchiveQueryToS3(database) {
    use(database);
    const collections = db.getSisterDB(database)
        .getCollectionNames()
        .filter((collection) => !excludeCollections.includes(collection));
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
            }
            else {
            }
            const query = {
                [config.timeField]: {
                    $lt: endDate,
                    $gte: startDate,
                },
            };
            pipeline.push({
                $match: query,
            });
            return {
                query,
                startDate,
                endDate,
            };
        }
        // Generate the query
        const { startDate, endDate } = generateQuery(new Date());
        function getYMD(date) {
            return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        }
        // Generate the folder structure
        const folderStructure = generateFolderStructure(startDate);
        const fileName = `${folderStructure}/${collection}_${getYMD(startDate)}_${getYMD(endDate)}`;
        // $out to S3
        pipeline.push({
            $out: {
                s3: Object.assign(Object.assign({}, sinkS3Config), { filename: fileName }),
            }
        });
        batches.push(() => {
            db.getSlibingDB(database)
                .getCollection(collection)
                .aggregate(pipeline);
        });
    }
    return batches;
}
generateArchiveQueryToS3(database);
