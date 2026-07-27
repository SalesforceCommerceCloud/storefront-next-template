/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Typography } from '@/components/typography';
import { useTranslation, withTranslation, type WithTranslation } from 'react-i18next';
import { useNavigate } from '@/hooks/use-navigate';
import { routes } from '@/route-paths';

function ReturnToCartButton() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <Button variant="outline" onClick={() => void navigate(routes.cart)}>
            {t('checkout:errorBoundary.returnToCart')}
        </Button>
    );
}

interface CheckoutErrorBoundaryProps extends WithTranslation {
    children: ReactNode;
    fallback?: ReactNode;
}

interface CheckoutErrorBoundaryState {
    hasError: boolean;
}

/**
 * ErrorBoundary specifically designed for checkout operations
 * Provides graceful fallbacks for basket enhancement and checkout errors
 */
class CheckoutErrorBoundaryClass extends Component<CheckoutErrorBoundaryProps, CheckoutErrorBoundaryState> {
    constructor(props: CheckoutErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(_error: Error): CheckoutErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
        // Customer integration point: add your APM's captureException() here
        // (e.g., Sentry, Datadog RUM, New Relic Browser)
    }

    private handleRetry = () => {
        this.setState({ hasError: false });
    };

    render() {
        const { t } = this.props;

        if (this.state.hasError) {
            // Custom fallback UI or use provided fallback
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <Card className="mx-auto max-w-2xl">
                    <CardContent className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
                        <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
                        <Typography variant="h2" as="h2" className="mb-2 text-2xl font-bold text-destructive">
                            {t('checkout:errorBoundary.title')}
                        </Typography>
                        <Typography variant="p" className="mb-6 max-w-md text-muted-foreground">
                            {t('checkout:errorBoundary.description')}
                        </Typography>
                        <div className="flex gap-3">
                            <Button onClick={this.handleRetry}>
                                <RefreshCw className="h-4 w-4" />
                                {t('checkout:errorBoundary.tryAgain')}
                            </Button>
                            <ReturnToCartButton />
                        </div>
                    </CardContent>
                </Card>
            );
        }

        return this.props.children;
    }
}

// Export the component wrapped with withTranslation HOC
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export const CheckoutErrorBoundary = withTranslation()(CheckoutErrorBoundaryClass);

/**
 * Lightweight error fallback for individual checkout components
 */
export function CheckoutComponentError({ retry }: { error?: Error; retry?: () => void }) {
    const { t } = useTranslation('checkout');
    return (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-2xl font-bold">{t('errorBoundary.componentError.title')}</AlertTitle>
            <AlertDescription className="text-2xl font-bold">
                {t('errorBoundary.componentError.description')}
                {retry && (
                    <Button variant="link" size="sm" onClick={retry} className="ml-2 h-auto p-0 font-bold">
                        {t('errorBoundary.componentError.tryAgain')}
                    </Button>
                )}
            </AlertDescription>
        </Alert>
    );
}
