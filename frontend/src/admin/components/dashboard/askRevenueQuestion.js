export function handleQuestionKeyDown(event, submit) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return false;
  event.preventDefault();
  submit();
  return true;
}

export async function askRevenueQuestion({
  question,
  inFlightRef,
  request,
  setIsLoading,
  setAnswer,
  setChart,
  setTimestamp,
  setError
}) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || inFlightRef.current) return false;

  inFlightRef.current = true;
  setIsLoading(true);
  setError('');
  setAnswer('');
  setChart?.(null);
  setTimestamp('');
  try {
    const response = await request(trimmedQuestion);
    if (typeof response?.answer !== 'string' || !response.answer.trim()) {
      throw new Error('The AI returned an empty answer. Please try again.');
    }
    setAnswer(response.answer);
    setChart?.(response.chart || null);
    setTimestamp(response.timestamp || new Date().toISOString());
    return true;
  } catch (requestError) {
    setError(requestError.message || 'We could not reach revenue analysis. Please try again.');
    return false;
  } finally {
    inFlightRef.current = false;
    setIsLoading(false);
  }
}
