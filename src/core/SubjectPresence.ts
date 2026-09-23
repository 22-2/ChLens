/** subject.txtの欠落は掲示板応答ではなく、アプリ側の更新状態として扱う。 */
export const isMissingFromSubject = (status?: string): boolean => status === "not_found";
