// Data Model
type CollectionDataSource = {}
type CollectionDataSourceAtlas = CollectionDataSource & {
  storeName: string
  database: string
  collection: string
}

type CollectionDataSourceS3 = CollectionDataSource & {
  path: string // S3 path
  storeName: string // S3 bucket name
}

type CollectionDataSources = CollectionDataSourceAtlas | CollectionDataSourceS3

type Collection = {
  name: string
  dataSources: CollectionDataSources[]
}

type Database = {
  name: string
  collections: Collection[]
  views: any[] // TODO: Define view type
}

// Data sources
type DataSource = {
  name: string
  provider: 'atlas' | 's3'
}

type DataSourceAtlasReadPreferenceMode = 'secondary' | 'primary' | 'primaryPreferred' | 'secondaryPreferred' | 'nearest'
type DataSourceAtlasReadPreference = {
  mode: DataSourceAtlasReadPreferenceMode
  maxStalenessSeconds?: number
  tagSets?: { name: string, value: string }[][]
}

type DataSourceAtlasReadConcernLevel = 'local' | 'majority' | 'linearizable' | 'available' | 'snapshot'
type DataSourceAtlasReadConcern = { level: DataSourceAtlasReadConcernLevel }

type DataSourceAtlas = DataSource & {
  provider: 'atlas'
  clusterName: string
  projectId: string
  readPreference?: DataSourceAtlasReadPreference
  readConcern?: DataSourceAtlasReadConcern
}

type DataSourceS3 = DataSource & {
  provider: 's3'
  bucket: string
  delimiter: string
  region: string
  prefix?: string
}

type DataSourceConfig = DataSourceAtlas | DataSourceS3

// Data federation
type DataFederationOutput = {
  databases: Database[]
  stores: DataSourceConfig[]
}

type adminCommandListDatabasesResult = {
  name: string
  sizeOnDisk: number
  empty: boolean
}

// Define db at the global scope as the MongoDB database object instance after create the object instance
declare const db: {
  adminCommand: (command: { listDatabases: 1 }) => {
    databases: adminCommandListDatabasesResult[]
  }

  [key: string]: any
}

// Define use function to switch the current database
declare function use(database: string): void