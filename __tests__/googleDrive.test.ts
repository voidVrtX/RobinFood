import { getGoogleDriveFileId, normalizeGoogleDriveImageUrl } from '@/utils/googleDrive';

describe('Google Drive public image links', () => {
  it('accepts a public file sharing link', () => {
    const id = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789';
    expect(getGoogleDriveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(id);
    expect(normalizeGoogleDriveImageUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`))
      .toBe(`https://drive.google.com/thumbnail?id=${id}&sz=w1200`);
  });

  it('rejects folder links', () => {
    expect(getGoogleDriveFileId('https://drive.google.com/drive/folders/1KfdGtxix6gpkZTN0jKhBIASgrdEo4IZ7'))
      .toBeNull();
  });
});
