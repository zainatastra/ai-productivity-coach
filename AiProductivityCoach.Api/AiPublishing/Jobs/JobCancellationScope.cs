namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// Watches the job state while a handler runs. When the admin cancels the job the
    /// shared token is cancelled, so running fetches and AI calls stop promptly.
    /// </summary>
    public sealed class JobCancellationScope : IDisposable
    {
        private readonly CancellationTokenSource _cts;
        private readonly Task _watcher;

        public JobCancellationScope(JobContext context, CancellationToken outer)
        {
            _cts = CancellationTokenSource.CreateLinkedTokenSource(outer);

            _watcher = Task.Run(async () =>
            {
                try
                {
                    while (!_cts.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(1.5), _cts.Token);

                        if (await context.IsCancelledAsync())
                        {
                            Cancelled = true;
                            _cts.Cancel();
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    // scope ended
                }
            });
        }

        public CancellationToken Token => _cts.Token;

        /// <summary>True when the ADMIN cancelled the job (not a server shutdown).</summary>
        public bool Cancelled { get; private set; }

        public void Dispose()
        {
            _cts.Cancel();
            try { _watcher.Wait(TimeSpan.FromSeconds(3)); } catch { /* watcher ends with the scope */ }
            _cts.Dispose();
        }
    }
}
