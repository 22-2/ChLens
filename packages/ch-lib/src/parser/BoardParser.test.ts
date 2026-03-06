import { describe, it, expect } from 'vitest';
import { BoardParser } from './BoardParser';
import { ChURL } from '../url/ChURL';

describe('BoardParser', () => {
  it('should parse 5ch style subject.txt', () => {
    const url = new ChURL('https://egg.5ch.net/software/');
    const text = '1000000002.dat<>Thread Title (10)\n' +
                 '1000000003.dat<>Another Thread [無断転載禁止] (100)\n';
    
    const result = BoardParser.parse(url, text);
    expect(result).toHaveLength(2);
    
    expect(result[0].title).toBe('Thread Title');
    expect(result[0].resCount).toBe(10);
    expect(result[0].url).toBe('https://egg.5ch.net/test/read.cgi/software/1000000002/');
    
    expect(result[1].title).toBe('Another Thread');
    expect(result[1].resCount).toBe(100);
  });

  it('should parse Shitaraba style subject.txt', () => {
    const url = new ChURL('https://jbbs.shitaraba.net/computer/12345/');
    const text = '1000000002.cgi,Thread Title(10)\n' +
                 '1000000003.cgi,Another Thread(100)\n' +
                 '1000000004.cgi,Sacrificial Thread(1)\n';
    
    const result = BoardParser.parse(url, text);
    expect(result).toHaveLength(2);
    
    expect(result[0].title).toBe('Thread Title');
    expect(result[0].resCount).toBe(10);
    expect(result[0].url).toBe('https://jbbs.shitaraba.net/bbs/read.cgi/computer/12345/1000000002/');
  });
});
