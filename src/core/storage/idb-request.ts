/** IndexedDB要求の成功イベント。targetを元要求として型付けしresultを取得できる。 */
export type IDBRequestSuccessEvent<T> = Event & { readonly target: IDBRequest<T> };

/** IndexedDBの成功イベントそのものをPromiseの値として扱う。 */
export const indexedDBRequestToPromise = <T>(
  req: IDBRequest<T>,
): Promise<IDBRequestSuccessEvent<T>> =>
  new Promise((resolve, reject) => {
    // 呼び出し元がrequest.resultを読む既存契約を守るため、成功イベント自体を返す。
    req.onsuccess = (event) => resolve(event as IDBRequestSuccessEvent<T>);
    req.onerror = reject;
  });
