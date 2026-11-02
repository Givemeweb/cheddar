import React from 'react';
import { render } from '@testing-library/react-native';
import {
  CryptoPaymentModal,
  CryptoPaywallAction,
  CryptoPaywallLegal,
} from './cryptoDisabled';

describe('store crypto stub', () => {
  it('renders nothing so the store build has no Bitcoin UI', () => {
    expect(
      render(<CryptoPaywallAction pending onPress={jest.fn()} />).toJSON(),
    ).toBeNull();
    expect(render(<CryptoPaywallLegal />).toJSON()).toBeNull();
    expect(render(<CryptoPaymentModal onClose={jest.fn()} />).toJSON()).toBeNull();
  });
});
