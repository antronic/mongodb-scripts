/**
 * This script generates a JSON file that can be used to create a MongoDB Atlas Data Federation.
 */

// ============================

// User configuration
// As Data Source
const atlasDataSourceConfig: DataSourceAtlas = {
  name: 'AtlasDev',
  provider: 'atlas',
  clusterName: 'Cluster0',
  projectId: 'project0',
  readPreference: {
    mode: 'primary',
  },
  readConcern: {
    level: 'local',
  },
}

const s3DataSources: DataSourceS3[] = [
  {
    name: 'SinkDataSource',
    bucket: 'bucket0',
    delimiter: '/',
    region: 'ap-southeast-1',
    prefix: '',
    provider: 's3',
  }
]

// ============================

// Define the stores
const stores: DataSourceConfig[] = []

function createAtlasStore(name: string, config: DataSourceAtlas): DataSourceAtlas {
  const store: DataSourceAtlas = {
    ...config,
    name,
    provider: 'atlas',
  }

  return store
}

function createS3Store(name: string, config: DataSourceS3): DataSourceS3 {
  const store: DataSourceS3 = {
    ...config,
    name,
    provider: 's3',
  }

  return store
}

// Define the data federation output
const output: DataFederationOutput = {
  databases: [],
  stores: [],
}

// Define the target and exclude databases
const excludeDatabases: string[] = ['admin', 'config', 'local']
const includeDatabases: string[] = []
const isIncludeMode = false

// Define the collections
const collections: Collection[] = []

// Define the databases
const databases: Database[] = []


function main() {
  // Get all the databases
  const allDatabases = db.adminCommand({ listDatabases: 1 }).databases

  // Filtered databases
  let targetDatabases: adminCommandListDatabasesResult[] = []

  // Filter the databases
  if (isIncludeMode) {
    targetDatabases = allDatabases.filter(database => includeDatabases.includes(database.name))
  } else {
    targetDatabases = allDatabases.filter(database => !excludeDatabases.includes(database.name))
  }

  // MongoDB Atlas Data Source

  const atlasStore = createAtlasStore(atlasDataSourceConfig.name, atlasDataSourceConfig)
  stores.push(atlasStore)

  // Iterate over the target databases
  for (const database of targetDatabases) {
    const collections: string[] = db.getSiblingDB(database.name).getCollectionNames()

    // TODO: Define view type
    // const views = db.getSiblingDB(database.name).getCollectionNames().filter(name => name.startsWith('view_'))

    const databaseObject: Database = {
      name: database.name,
      collections: collections.map((collection) => {
        // Convert the system collection to a normal collection
        if (collection.startsWith('system.')) {
          collection = collection.replace('system.', 'system_');
        }

        const dataSources: CollectionDataSourceAtlas[] = [
          {
            storeName: atlasDataSourceConfig.name,
            database: database.name,
            collection,
          }
        ]

        return {
          name: collection,
          dataSources,
        }
      }),
      views: [], // Not implemented yet
    }

    databases.push(databaseObject)
  }

  // Create the data federation output
  output.databases = databases
  output.stores = stores

  output.stores = [
    ...stores,
    ...s3DataSources.map((s3DataSource) => createS3Store(s3DataSource.name, s3DataSource)),
  ]
  // Write the data federation output to a JSON file
  // writeFileSync('data-federation-output.json', JSON.stringify(output, null, 2))

  return output
}

main()