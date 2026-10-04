export function useEmulator(rzp: any, baseUrl = 'http://localhost:4000') {
  const rq = rzp?.api?.rq;
  if (!rq || !rq.defaults) {
    throw new Error(
      'razorpay-local: cannot find the SDK HTTP client (rzp.api.rq). ' +
        'Your razorpay SDK version may be unsupported. Run `npm ls razorpay`.'
    );
  }
  rq.defaults.baseURL = baseUrl;
  return rzp;
}