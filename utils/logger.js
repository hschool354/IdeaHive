const logger = {
    error: (message, error) => {
      console.error(`ERROR: ${message}`, error);
    },
    info: (message) => {
      console.log(`INFO: ${message}`);
    },
    warn: (message) => {
      console.warn(`WARN: ${message}`);
    },
    debug: (message) => {
      console.debug(`DEBUG: ${message}`);
    }
  };
  
  module.exports = logger;