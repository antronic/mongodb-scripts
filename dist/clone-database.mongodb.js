"use strict";
/**
 * This script generates a JSON file that can be used to create a MongoDB Atlas Data Federation.
 */
// ============================
// User configuration
// As Data Source
const atlasDataSourceConfig = {
    name: 'AtlasDev',
    provider: 'atlas',
    clusterName: 'Cluster0',
    projectId: '63f2edb337df1e5f6a9e11ee',
    readPreference: {
        mode: 'primary',
    },
    readConcern: {
        level: 'local',
    },
};
const s3DataSources = [
    {
        name: 'SinkDataSource',
        bucket: 'bucket0',
        delimiter: '/',
        region: 'ap-southeast-1',
        prefix: '',
        provider: 's3',
    }
];
// ============================
// Define the stores
const stores = [];
function createAtlasStore(name, config) {
    const store = Object.assign(Object.assign({}, config), { name, provider: 'atlas' });
    return store;
}
function createS3Store(name, config) {
    const store = Object.assign(Object.assign({}, config), { name, provider: 's3' });
    return store;
}
// Define the data federation output
const output = {
    databases: [],
    stores: [],
};
// Define the target and exclude databases
const excludeDatabases = ['admin', 'config', 'local'];
const includeDatabases = [];
const isIncludeMode = false;
// Define the collections
const collections = [];
// Define the databases
const databases = [];
function main() {
    // Get all the databases
    const allDatabases = db.adminCommand({ listDatabases: 1 }).databases;
    // Filtered databases
    let targetDatabases = [];
    // Filter the databases
    if (isIncludeMode) {
        targetDatabases = allDatabases.filter(database => includeDatabases.includes(database.name));
        targetDatabases = targetDatabases.filter(database => !excludeDatabases.includes(database.name));
    }
    else {
        targetDatabases = allDatabases.filter(database => !excludeDatabases.includes(database.name));
    }
    // MongoDB Atlas Data Source
    const atlasStore = createAtlasStore(atlasDataSourceConfig.name, atlasDataSourceConfig);
    stores.push(atlasStore);
    // Iterate over the target databases
    for (const database of targetDatabases) {
        const collections = db.getSiblingDB(database.name).getCollectionNames();
        // TODO: Define view type
        // const views = db.getSiblingDB(database.name).getCollectionNames().filter(name => name.startsWith('view_'))
        const databaseObject = {
            name: database.name,
            collections: collections.map((collection) => {
                // Convert the system collection to a normal collection
                if (collection.startsWith('system.')) {
                    collection = collection.replace('system.', 'system_');
                }
                const dataSources = [
                    {
                        storeName: atlasDataSourceConfig.name,
                        database: database.name,
                        collection,
                    }
                ];
                return {
                    name: collection,
                    dataSources,
                };
            }),
            views: [], // Not implemented yet
        };
        databases.push(databaseObject);
    }
    // Create the data federation output
    output.databases = databases;
    output.stores = stores;
    output.stores = [
        ...stores,
        ...s3DataSources.map((s3DataSource) => createS3Store(s3DataSource.name, s3DataSource)),
    ];
    // Write the data federation output to a JSON file
    // writeFileSync('data-federation-output.json', JSON.stringify(output, null, 2))
    return output;
}
main();
