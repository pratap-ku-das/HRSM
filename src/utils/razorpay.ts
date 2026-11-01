export interface RazorpayCheckoutOptions {
  key: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Loads the official Razorpay Checkout script if not already available in DOM.
 */
export function loadRazorpayCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('[RAZORPAY_LOAD_FAILED] Failed to load checkout.js');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Opens Razorpay standard checkout popup.
 */
export async function openRazorpayCheckout(
  options: RazorpayCheckoutOptions
): Promise<RazorpayPaymentSuccessResponse> {
  const loaded = await loadRazorpayCheckoutScript();
  if (!loaded || !window.Razorpay) {
    throw new Error('Razorpay Checkout failed to load. Please check your network connection.');
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      ...options,
      theme: {
        color: '#4f46e5', // Brand primary indigo
        ...options.theme,
      },
      handler: (response: RazorpayPaymentSuccessResponse) => {
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          if (options.modal?.ondismiss) {
            options.modal.ondismiss();
          }
          reject(new Error('Checkout cancelled by user'));
        },
      },
    });

    rzp.on('payment.failed', (response: any) => {
      const err = response?.error;
      reject(new Error(err?.description || err?.reason || 'Payment failed'));
    });

    rzp.open();
  });
}

