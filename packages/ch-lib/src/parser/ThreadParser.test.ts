import { describe, it, expect } from 'vitest';
import { ThreadParser } from './ThreadParser';
import { ChURL } from '../url/ChURL';

describe('ThreadParser', () => {
  it('should parse 2ch style dat with metadata', () => {
    const url = new ChURL('https://egg.5ch.net/test/read.cgi/software/1000000001/');
    const dat = 'Name1</b>(Slip 1)<b><>Mail1<>2026/03/06(金) 12:00:00.00 ID:TestImage5<>Message1<>Thread Title\n' +
                'Name2</b>◆Trip2<b><>Mail2<>2026/03/06(金) 12:05:00.00 ID:def67890<>Message2<>\n';
    
    const result = ThreadParser.parse(url, dat);
    expect(result.title).toBe('Thread Title');
    expect(result.posts).toHaveLength(2);
    
    expect(result.posts[0].name).toBe('Name1</b>(Slip 1)<b>');
    expect(result.posts[0].id).toBe('ID:TestImage5');
    expect(result.posts[0].slip).toBe('Slip 1');

    expect(result.posts[1].name).toBe('Name2</b>◆Trip2<b>');
    expect(result.posts[1].id).toBe('ID:def67890');
    expect(result.posts[1].trip).toBe('◆Trip2');
  });
});
