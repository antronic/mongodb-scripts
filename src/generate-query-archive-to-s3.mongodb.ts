const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)
// ignore timezone
const timezone = require('dayjs/plugin/timezone')
dayjs.extend(timezone)


// ======================================================================
/**
 * Database name
 */
const isDeleteAfterArchive = false

/**
 * Archive databases mapping
 * This function will archive all collections in the database by default
 *
 * The first element is the database name
 * The second element is the collections to Exclude
 * The third element is the custom folder structure function
 */
const archiveDatabases: [string, string[], FuncCustomFolderStructure][] = [
  // ['VirtualDatabase0', ['VirtualCollection0'], (db, coll) => `GROUP/${db}/${coll}`],
  ['BIAN_ITML_ARC', [''], (db, coll) => `BIAN/${db}/${coll}`],
]


/**
 * Backup configuration
 */
const config: BackupConfig = {
  // How many month long we need to keep on MongoDB before we can archive to S3
  // Control direction
  monthToArchive: 3,
  // How many month long we need to keep on MongoDB before we can delete
  monthToKeep: 3,
  // Backup the data that we keep on MongoDB
  backupKeepData: false,
  // Backup from starting of database
  backupFromStart: false,
  // Backup include starting point month
  includeCurrentMonth: false,

  // The field we need to compare to dataRentention
  timeField: 'A_COMMIT_TIMESTAMP',
  // The time field is string or not
  isTimeFieldIsString: true,

  // The custom time range
  customTimeRange: {
    dateTime: '2024-10-01',
  }
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

interface SummaryInformation {
  databases: { [key: string]: string[] };
  time: number;
}

let summaryInformation: SummaryInformation = { databases: {}, time: 0 };

let _system_confing: SystemConfig = {
  startDateTime: dayjs(),
  endDateTime: dayjs(),
}

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

  folders.push(ts.getFullYear().toString())
  folders.push(addLeadingZero(ts.getMonth() + 1))

  // NOT SUPPORT YET, we will support it later
  // Currently, we only support month granularity

  // switch (config.timeGanularity) {
  //   case 'day':
  //     folders.push(ts.getFullYear().toString())
  //     // month is lower than 10, we need to add 0 in front of it
  //     folders.push(addLeadingZero(ts.getMonth() + 1))
  //     folders.push(addLeadingZero(ts.getDate()))
  //     break
  //   case 'month':
  //     folders.push(ts.getFullYear().toString())
  //     folders.push(addLeadingZero(ts.getMonth() + 1))
  //     break
  //   case 'year':
  //     folders.push(ts.getFullYear().toString())
  //     break
  // }

  return folders.join('/')
}


function generateArchiveQueryToS3(database: string, _excludeCollections: string[] = [], customFolderStructure?: FuncCustomFolderStructure) {
  use(database)

  const collections = db.getSiblingDB(database)
    .getCollectionNames()
    .filter((collection: string) => !_excludeCollections.includes(collection))

  let databasesResult = {}

  /**
     * Define month range
     */
  function setupMonthRange() {
    const today = dayjs()
    let _startDate = dayjs(today).startOf('month').startOf('day')
    let _endDate = dayjs(today).startOf('month').startOf('day')

    function setupDefaultRange() {
      // Mid night of first day of the month
      _startDate = dayjs(today).startOf('month')
      // if isBackupFromStart is true, we need to backup from the start
      if (config.backupFromStart) {
        _startDate = null
      }
    }

    setupDefaultRange()

    let useCustomTimeRange = false
    // if has customTimrRange is true, we will use the custom time range
    if (config.customTimeRange && config.customTimeRange.dateTime !== null) {
      useCustomTimeRange = true

      try {
        if (config.customTimeRange.dateTime !== null) {
          const dateTime = dayjs(config.customTimeRange.dateTime)

          _startDate = dayjs(dateTime).startOf('month')
          _endDate = dayjs(dateTime).endOf('month').add(1, 'day').startOf('day')
          if (!config.includeCurrentMonth) {
            _endDate = _endDate.subtract(1, 'month').startOf('month').startOf('day')
          }
        }
      } catch (error) {
        console.error('Invalid custom time range')
        throw error
      }
    }

    _startDate = dayjs(_startDate).startOf('month')
    if (config.backupKeepData) {
      _startDate = dayjs(_startDate).subtract(config.monthToArchive, 'month').startOf('month').startOf('day')
    } else {
      _endDate = dayjs(_endDate).subtract(config.monthToKeep, 'month').startOf('day')
      _startDate = dayjs(_startDate).subtract(config.monthToArchive + config.monthToKeep, 'month').startOf('month').startOf('day')
    }

    console.log([_startDate.format('YYYY-MM-DD HH:mm'), _endDate.format('YYYY-MM-DD HH:mm'), dayjs().date()])

    _system_confing.endDateTime = _endDate
    _system_confing.startDateTime = _startDate

    const monthRange: number = dayjs(_endDate).diff(_startDate, 'month')

    function extractYearMonthFromRange() {
      let curr = dayjs(_startDate).format('YYYY-MM-DD')
      return new Array(monthRange).fill(0).map((_, index) => {
        const next = dayjs(curr).add(1, 'month').startOf('month').format('YYYY-MM-DD')
        const range = [curr, next]
        curr = next
        return range
      })
    }

    // Return different month range
    return { monthRange, range: extractYearMonthFromRange() }
  }

  const { monthRange, range } = setupMonthRange()

  console.log('Month range:', monthRange)
  console.log(range)

  // return;
  for (const collection of collections) {
    // Aggregation pipeline

    const monthBatches: Function[] = []
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

      monthBatches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}").aggregate(${JSON.stringify(pipeline).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')});`)

      // Delete the data after archive
      if (isDeleteAfterArchive) {
        // monthBatches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}").deleteMany({query:${JSON.stringify(query).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')}});`)
        monthBatches.push(() => `db.getSiblingDB("${database}").getCollection("${collection}")
        .updateMany(
          { "${config.timeField}": ${JSON.stringify(query).replace(/"ISODate\((.*?)\)"/g, 'ISODate($1)')} },
          { "archived": true }
        );`)
      }

      return monthBatches
    }


    // Generate the archive collection by month
    for (let i = 0; i < Math.abs(range.length); i++) {
      const start = dayjs(range[i][0]).toDate()
      const end = dayjs(range[i][1]).toDate()
      // const batches = generateArchiveCollectionByMonth(start, end)
      generateArchiveCollectionByMonth(start, end)
    }

    databasesResult = {
      ...databasesResult,
      [`${database}.${collection}`]: monthBatches.map((batch, index) => {
        console.log(`Running batch ${database}.${collection}... [${index + 1}/${monthBatches.length}]`)
        return batch()
      })
    }

    summaryInformation.databases = {
      ...summaryInformation.databases,
      [database]: [...summaryInformation.databases[database], collection],
    }

    console.log('==========================')
  }

  // return results
  return databasesResult
}

function printSummary() {
  console.log('########################################')
  console.log('############# SUMMARY ##################')
  console.log('########################################')
  const dbs = Object.keys(summaryInformation.databases)
  console.log(`Database [${dbs.length}]: ${dbs.join(', ')}`)
  console.log('--------------------')

  Object.keys(summaryInformation.databases)
    .forEach((db) => {
      const collections = summaryInformation.databases[db]
      console.log(`Database: ${db}`)
      console.log(`Collections [${collections.length}]: ${collections.join(', ')}`)
      console.log('--------------------')
    })

  console.log(`Time field: ${config.timeField}`)
  console.log(`Delete after archive: ${isDeleteAfterArchive}`)
  console.log('--------------------')
  console.log(`Time usage: ${summaryInformation.time} ms`)
  console.log('########################################')
}

// ======================================================================
// ======================================================================
const allResults: any[] = []
let startExecution = 0

function startArchive() {
  startExecution = Date.now()
  for (const [db, colls, folder] of archiveDatabases) {
    summaryInformation.databases = {
      ...summaryInformation.databases,
      [db]: [],
    }
    const result = generateArchiveQueryToS3(db, colls, folder)
    allResults.push(result)
  }

  console.log("=========================================")
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
  summaryInformation.time = Date.now() - startExecution

  // Object.values(allResults).forEach(result => console.log(result))
  printSummary()
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
