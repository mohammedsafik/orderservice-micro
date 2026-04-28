function serializeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, key) => {
      result[key] = serializeValue(value[key]);
      return result;
    }, {});
  }

  return value;
}

function write(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message
  };

  if (meta && Object.keys(meta).length > 0) {
    payload.meta = serializeValue(meta);
  }

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  info(message, meta) {
    write('info', message, meta);
  },
  warn(message, meta) {
    write('warn', message, meta);
  },
  error(message, meta) {
    write('error', message, meta);
  },
  debug(message, meta) {
    if (process.env.NODE_ENV !== 'production') {
      write('debug', message, meta);
    }
  }
};
