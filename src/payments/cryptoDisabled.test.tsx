import React from 'react';
import { render } from '@testing-library/react-native';
import {
  CryptoPaymentModal,
  CryptoPaywallAction,
  CryptoPaywallLegal,
  CryptoRestoreForm,
} from './cryptoDisabled';

describe('store crypto stub', () => {
  it('renders nothing so the store build has no Bitcoin UI or license field', () => {
    expect(
      render(<CryptoPaywallAction pending onPress={jest.fn()} />).toJSON(),
    ).toBeNull();
    expect(render(<CryptoPaywallLegal />).toJSON()).toBeNull();
    expect(render(<CryptoRestoreForm />).toJSON()).toBeNull();
    expect(render(<CryptoPaymentModal onClose={jest.fn()} />).toJSON()).toBeNull();
  });
});
