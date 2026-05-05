import { consola } from "consola";

const rootLogger = consola.withTag("chlens");

type Logger = typeof rootLogger;

const loggers = new Set<Logger>([rootLogger]);

export function createLogger(tag: string): Logger {
  const logger = rootLogger.withTag(tag);
  loggers.add(logger);
  return logger;
}

export function setConsolaLevel(level: number): void {
  for (const logger of loggers) {
    logger.level = level;
  }
}
