/**
 * This script generates a JSON file that can be used to create a MongoDB Atlas Data Federation.
 */

const output = {}

//
const databases = []
const stores = []

// Superclass
const DataSource = function(name, provider) {
  this.name = name
  this.provider = null

  this.setProvider = function(provider) {
    this.provider = provider
  }

  this.setConfig = function(config) {
    // Configuration logic here
  }
}

// Subclass
const S3DataSource = function(name, bucketName) {
  // Call the superclass constructor
  DataSource.call(this, name)
  this.bucketName = bucketName
}

// Inherit from DataSource
S3DataSource.prototype = Object.create(DataSource.prototype)
S3DataSource.prototype.constructor = S3DataSource

// Add subclass-specific methods
S3DataSource.prototype.setBucketName = function(bucketName) {
  this.bucketName = bucketName
}

// Usage
const s3 = new S3DataSource('MyS3DataSource', 'my-bucket')
s3.setProvider('AWS')
s3.setBucketName('new-bucket')
console.log(s3)

const Collection = function(name) {
  this.name = name
  this.dataSources = []
}

const Database = function(name) {
  this.name = name
  this.collections = []

  this.createCollection = function(name) {
    const collection = new Collection(name)
    this.collections.push(collection)
    return collection
  }

  this.addCollection = function(collection) {
    this.collections.push(collection)
  }
}

function createCollection() {}