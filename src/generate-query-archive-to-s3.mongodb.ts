const dayjs = require('dayjs')
// ======================================================================
/**
 * Database name
 */
const isDeleteAfterArchive = false

/**
 * Backup configuration
 */
const config: BackupConfig = {
  // How many month long we need to keep on MongoDB before we can archive to S3
  // Control direction
  monthRetention: 3,
  // The field we need to compare to dataRentention
  timeField: 'A_COMMIT_TIMESTAMP',
  // The time field is string or not
  isTimeFieldIsString: true,
  // The time granularity we need to compare to dataRentention
  // The value can be 'day', 'month', 'year'
  timeGanularity: 'month',
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
const isCustomTimeRange = true
const start = "2024-10-01"
const end = null


// Function add leading zero
function addLeadingZero(value: number): string {
  return value.toString().padStart(2, '0')
}

type FuncCustomFolderStructure = (db: string, coll: string) => string

/**
 * Generate the folder structure based on the time granularity
 *
 * @param timestamp
 * @returns
 */
function generateFolderStructure(timestamp: Date, db: string, coll: string, customFolderStructure: FuncCustomFolderStructure = (db: string, coll: string) => `${db}/${coll}`): string {
  const folders: string[] = [customFolderStructure(db, coll)]

  const ts = new Date(timestamp)

  switch (config.timeGanularity) {
    case 'day':
      folders.push(ts.getFullYear().toString())
      // month is lower than 10, we need to add 0 in front of it
      folders.push(addLeadingZero(ts.getMonth() + 1))
      folders.push(addLeadingZero(ts.getDate()))
      break
    case 'month':
      folders.push(ts.getFullYear().toString())
      folders.push(addLeadingZero(ts.getMonth() + 1))
      break
    case 'year':
      folders.push(ts.getFullYear().toString())
      break
  }

  return folders.join('/')
}


function generateArchiveQueryToS3(database: string, _excludeCollections: string[] = [], customFolderStructure?: FuncCustomFolderStructure) {
  use(database)

  const collections = db.getSiblingDB(database)
    .getCollectionNames()
    .filter((collection: string) => !_excludeCollections.includes(collection))

  let databasesResult = {}

  for (const collection of collections) {
    // Aggregation pipeline

    const batches: Function[] = []
    /**
     * Generate the archive collection
     */
    function generateArchiveCollectionByMonth(startDateInput: Date, endDateInput: Date) {
      const pipeline: any[] = []
      /**
       * Generate the query to archive the data to S3
       *
       * @param database
       * @param collection
       * @returns
       */
      type Query = { query: any, startDate: Date, endDate: Date }
      function generateQuery(_startDate: Date, _endDate: Date): Query {
        const direction = config.monthRetention > 0 ? -1 : 1
        const dayGanularity = 0
        const monthGanularity = config.timeGanularity === 'month' ? 1 : 0
        const yearGanularity = 0

        // Generate the query
        let query: any = {
          [config.timeField]: {
            $lt: `ISODate('${_endDate.toISOString()}')`,
            $gte: `ISODate('${_startDate.toISOString()}')`,
          },
        }

        // If the time field is string
        if (config.isTimeFieldIsString) {
          query = {
            [config.timeField]: {
              $gte: `${_startDate.getFullYear()}-${addLeadingZero(_startDate.getMonth() + 1)}-${addLeadingZero(_startDate.getDate())}`,
              $lt: `${_endDate.getFullYear()}-${addLeadingZero(_endDate.getMonth() + 1)}-${addLeadingZero(_endDate.getDate())}`,
            },
          }
        }

        return {
          query,
          startDate: _startDate,
          endDate: _endDate,
        }
      }

      // Generate the query
      const { startDate, endDate, query } = generateQuery(startDateInput, endDateInput)
      pipeline.push({ $match: query })

      // Get the year, month, day
      function getYM(date: Date) {
        return `${date.getFullYear()}-${addLeadingZero(date.getMonth() + 1)}`
      }

      // Generate the folder structure
      const folderStructure = generateFolderStructure(startDate, database, collection, customFolderStructure)

      const fileName = `${folderStructure}/${collection}_${getYM(startDate)}.${sinkS3Config.format.name}`

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

      return batches
    }

    // Generate the archive collection by month
    for (let i = 0; i < Math.abs(config.monthRetention); i++) {
      const today = new Date()

      // let _start = new Date(Date.UTC(today.getUTCFullYear(), today.getMonth() - (i), 1))
      let _start = dayjs(today).subtract(i, 'month').startOf('month').toDate()

      // let _end = new Date(Date.UTC(_start.getFullYear(), _start.getMonth() + 1, 1, 0, 0, 0, 0))

      if (isCustomTimeRange) {
        if (start !== null) {
          // const startIsoDate = new Date(start)
          // const __startCustom = new Date(Date.UTC(startIsoDate.getFullYear(), startIsoDate.getMonth(), startIsoDate.getDate()))
          const __startCustom = dayjs(start).startOf('day').toDate()
          // _start = new Date(Date.UTC(__startCustom.getFullYear(), __startCustom.getMonth() - i, 1))
          _start = dayjs(__startCustom).subtract(i, 'month').startOf('month').toDate()
        }

        // if (config.monthRetention > 0) {
        //   _start = new Date(Date.UTC(today.getUTCFullYear(), today.getMonth() + (i), 1))
        // }

        if (start !== null && end === null) {
          // if (config.monthRetention > 0) {
          //   _start = new Date(Date.UTC(start))
          //   _end = new Date(Date.UTC(_start.getFullYear(), _start.getMonth() + (i ), 0))
          // } else {
          //   _start = new Date(Date.UTC(_start.getFullYear(), _start.getMonth() + (i), 0))
          //   _end = new Date(Date.UTC(start))
          // }
        }
      }

      let _end = dayjs(_start).endOf('month').add(1, 'day').toDate()
      console.log('_start', _start)
      console.log(_end)

      // Mid night of first day of the month
      // let _startDate: Date = new Date(startDate.getFullYear(), startDate.getMonth(), 1)

      // End of last month
      // let _endDate = new Date(_startDate.getFullYear(), _startDate.getMonth() + monthGanularity, 0)

      // ==================
      // console.log({_start, _end})
      const batches = generateArchiveCollectionByMonth(_start, _end)
      databasesResult = {
        ...databasesResult,
        [`${database}.${collection}`]: batches.map((batch, index) => {
          console.log(`Running batch ${database}.${collection} - [${_start}, ${_end}]...`)
          return batch()
        })
      }
    }
    console.log('==========================')
  }

  // const results = batches.map((batch, index) => {
  //   console.log(`Running batch ${index + 1}...`)
  //   return batch()
  // })

  // return results
  return databasesResult
}

// function func() {
//   console.log('----------------------------------------')
//   console.log('Done!')
//   console.log('----------------------------------------')

//   function printSummary() {
//     console.log(`Database: ${database}`)
//     console.log(`Collections: ${collections.join(', ')}`)
//     console.log(`Time granularity: ${config.timeGanularity}`)
//     console.log(`Time field: ${config.timeField}`)
//     console.log(`Delete after archive: ${isDeleteAfterArchive}`)
//   }
//   printSummary()
//   console.log('----------------------------------------')

//   console.log()
//   console.log()
//   console.log('Result:')
//   console.log()
//   console.log('=========================================')
//   results.forEach((result) => console.log(result))
//   console.log('=========================================')
//   console.log()
//   console.log()
// }

/**
 * Archive databases mapping
 * This function will archive all collections in the database by default
 *
 * The first element is the database name
 * The second element is the collections to Exclude
 * The third element is the custom folder structure function
 */
const archiveDatabases: [string, string[], FuncCustomFolderStructure][] = [
  ['VirtualDatabase0', ['VirtualCollection0'], (db, coll) => `GROUP/${db}/${coll}`],
]

const allResults: any[] = []

function startArchive() {
  for (const [db, colls, folder] of archiveDatabases) {
    const result = generateArchiveQueryToS3(db, colls, folder)
    allResults.push(result)
  }

  console.log("RESULT:")
  console.log("=========================================")
  // allResults.forEach(result => console.log(result))
  allResults.forEach((dbResults) => {
    Object.keys(dbResults).forEach((key: any) => {
      const collResults = dbResults[key]

      // console.log(`# -- ${key} | COLL START -- #`)
      collResults.forEach((result: any) => console.log(result))
      // console.log(`# -- ${key} | COLL END -- #`)
    })
  })
  // Object.values(allResults).forEach(result => console.log(result))
}

startArchive()

// ======================================================================
// Warning: The delete after archive is enabled
if (isDeleteAfterArchive) {
  console.log()
  console.log('################################################')
  console.log('# Warning: The delete after archive is enabled #')
  console.log('################################################')
}
