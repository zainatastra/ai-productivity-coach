namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// Wakes the job worker as soon as a job is queued on this server, so the worker can poll the
    /// database rarely while idle (Firestore bills every read) and still start jobs immediately.
    /// </summary>
    public sealed class AiJobSignal
    {
        private readonly SemaphoreSlim _signal = new(0, 1);

        public void Notify()
        {
            try
            {
                _signal.Release();
            }
            catch (SemaphoreFullException)
            {
                // already signalled
            }
        }

        /// <summary>Waits until a job is queued or the timeout passes.</summary>
        public async Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) =>
            await _signal.WaitAsync(timeout, cancellationToken);
    }
}
