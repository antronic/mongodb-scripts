// ======================================================================
/**
 * Database name
 */
const database: string = 'mock_data'
const excludeCollections: string[] = []

const isDeleteAfterArchive = false

/**
 * Backup configuration
 */
const config: BackupConfig = {
  // How month long we need to keep on MongoDB before we can archive to S3
  monthRentention: 3,
  // The field we need to compare to dataRentention
  timeField: 'A_COMMIT_TIMESTAMP',
  // The time granularity we need to compare to dataRentention
  timeGanularity: 'day',
}

/**
 * Sink S3 configuration
 */
const sinkS3Config: SinkS3Config = {
  bucket: 'my-bucket',
  filename: 'my-filename',
  format: {
    name: 'bson.gz',
  }
}

// ======================================================================
// Custom the filter
const isCustomTimeRange = false
const start = null
const end = null

/**
 * Generate the folder structure based on the time granularity
 *
 * @param timestamp
 * @returns
 */
function generateFolderStructure(timestamp: Date) {
  const folders: string[] = []

  const ts = new Date(timestamp)

  switch (config.timeGanularity) {
    case 'day':
      folders.push(ts.getFullYear().toString())
      // month is lower than 10, we need to add 0 in front of it
      folders.push((ts.getMonth() + 1).toString().padStart(2, '0'))
      folders.push(ts.getDate().toString().padStart(2, '0'))
      break
    case 'month':
      folders.push((ts.getMonth() + 1).toString().padStart(2, '0'))
      folders.push((ts.getMonth() + 1).toString())
      break
    case 'year':
      folders.push(ts.getFullYear().toString())
      break
  }

  return folders.join('/')
}


const batches: Function[] = []

function generateArchiveQueryToS3(database: string) {
  use(database)

  const collections = db.getSiblingDB(database)
    .getCollectionNames()
    .filter((collection: string) => !excludeCollections.includes(collection))

  for (const collection of collections) {
    const pipeline: any[] = []

    /**
     * Generate the query to archive the data to S3
     *
     * @param database
     * @param collection
     * @returns
     */
    function generateQuery(startMonth: Date, endMonth?: Date) {
      // Mid night of first day of the month
      let startDate = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1)

      // End of last month
      let endDate = new Date(startDate.getFullYear(), startDate.getMonth() + config.monthRentention, 0)

      if (endMonth) {
        endDate = new Date(endMonth.getFullYear(), endMonth.getMonth())
      }

      if (isCustomTimeRange) {
        if (start !== null) {
          startDate = new Date(start)
        }

        if (end !== null) {
          endDate = new Date(end)
        } else {
          endDate = new Date(startDate.getFullYear(), startDate.getMonth() + config.monthRentention, 0)
        }
      } else {

      }

      const query = {
        [config.timeField]: {
          $lt: `ISODate('${endDate.toISOString()}')`,
          $gte: `ISODate('${startDate.toISOString()}')`,
        },
      }

      return {
        query,
        startDate,
        endDate,
      }
    }

    // Generate the query
    const { startDate, endDate, query } = generateQuery(new Date())
    pipeline.push({ $match: query })

    function getYMD(date: Date) {
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    }

    // Generate the folder structure
    const folderStructure = generateFolderStructure(startDate)
    const fileName = `${folderStructure}/${collection}_${getYMD(startDate)}_${getYMD(endDate)}.${sinkS3Config.format.name}`

    // $out to S3
    pipeline.push(
      {
        $out: {
          s3: {
            ...sinkS3Config,
            filename: fileName,
          },
        }
      }
    )

    batches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}").aggregate(${JSON.stringify(pipeline).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')});`)

    // Delete the data after archive
    if (isDeleteAfterArchive) {
      batches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}").deleteMany({query:${JSON.stringify(query).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')}});`)
    }
  }

  const results = batches.map((batch, index) => {
    console.log(`Running batch ${index + 1}...`)
    return batch()
  })

  console.log('----------------------------------------')
  console.log('Done!')
  console.log('----------------------------------------')

  function printSummary() {
    console.log(`Database: ${database}`)
    console.log(`Collections: ${collections.join(', ')}`)
    console.log(`Time granularity: ${config.timeGanularity}`)
    console.log(`Time field: ${config.timeField}`)
    console.log(`Delete after archive: ${isDeleteAfterArchive}`)
  }
  printSummary()
  console.log('----------------------------------------')

  console.log()
  console.log()
  console.log('Result:')
  console.log()
  console.log('=========================================')
  results.forEach((result) => console.log(result))
  console.log('=========================================')
  console.log()
  console.log()

  return results
}

generateArchiveQueryToS3(database)

// ======================================================================
// Warning: The delete after archive is enabled
console.log()
console.log('################################################')
console.log('# Warning: The delete after archive is enabled #')
console.log('################################################')
