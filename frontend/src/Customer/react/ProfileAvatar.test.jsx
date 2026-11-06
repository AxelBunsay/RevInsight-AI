import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProfileAvatar from './ProfileAvatar';
import { getCustomerProfileImageValidationError, MAX_CUSTOMER_PROFILE_IMAGE_SIZE } from './profileImageValidation';

function renderAvatar(props = {}) {
  return renderToStaticMarkup(
    <ProfileAvatar
      initial="C"
      profileImage={null}
      previewUrl=""
      inputRef={{ current: null }}
      isLoading={false}
      error=""
      onChoose={() => {}}
      onFileChange={() => {}}
      onRemove={() => {}}
      {...props}
    />
  );
}

describe('customer profile avatar', () => {
  it('falls back to the initial when no profile image exists', () => {
    const markup = renderAvatar();

    expect(markup).toContain('>C</span>');
    expect(markup).not.toContain('<img');
  });

  it('renders the profile image when one is available', () => {
    const markup = renderAvatar({ profileImage: 'https://example.test/customer.jpg' });

    expect(markup).toContain('<img src="https://example.test/customer.jpg" alt="Customer profile"/>');
  });

  it('reports unsupported types and files over 5 MB', () => {
    expect(getCustomerProfileImageValidationError({ type: 'image/gif', size: 20 }))
      .toBe('Choose a JPG or PNG image.');
    expect(getCustomerProfileImageValidationError({ type: 'image/png', size: MAX_CUSTOMER_PROFILE_IMAGE_SIZE + 1 }))
      .toBe('Profile image must be 5 MB or smaller.');
    expect(getCustomerProfileImageValidationError({ type: 'image/jpeg', size: MAX_CUSTOMER_PROFILE_IMAGE_SIZE }))
      .toBe('');
  });
});
