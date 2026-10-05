export function useEmulator(rzp: any, baseUrl = 'http://localhost:4000') {
  const rq = rzp?.api?.rq;
  if (!rq) {
    throw new Error(
      'razorpay-local: cannot find the SDK HTTP client (rzp.api.rq). ' +
        'Run `npm ls razorpay` and open an issue with the version number.'
    );
  }

  // The newer SDK uses Axios: defaults is an object and getUri exists.
  const isAxiosClient =
    typeof rq.getUri === 'function' &&
    rq.defaults !== null &&
    typeof rq.defaults === 'object';

  if (!isAxiosClient) {
    throw new Error(
      'razorpay-local: unsupported razorpay SDK version. This helper needs razorpay 2.9.4 or newer. Run `npm ls razorpay` and upgrade the package.'
    );
  }

  rq.defaults.baseURL = baseUrl;
  if (rq.defaults.baseURL !== baseUrl) {
    throw new Error('razorpay-local: failed to redirect the SDK to ' + baseUrl);
  }
  return rzp;
}