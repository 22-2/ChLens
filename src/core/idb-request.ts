/** IndexedDBの成功イベントをそのままPromiseの値として扱う。 */
export const indexedDBRequestToPromise = (req: IDBRequest): Promise<Event> =>
  new Promise((resolve, reject) => {
    // 呼び出し元がrequest.resultを読む既存契約を守るため、成功イベント自体を返す。
    req.onsuccess = resolve;
    req.onerror = reject;
  });
