import { jest } from '@jest/globals'
import productUpdatedHandler from '../product-updated'
import admin from '../../firebase/config-firebase'

jest.mock('../../firebase/config-firebase', () => {
    const firestoreMock = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(),
        doc: jest.fn().mockReturnThis(),
        set: jest.fn()
    }
    return { firestore: () => firestoreMock }
})

const mockContainer = {
    resolve: jest.fn((key: string) => {
        if (key === 'product') {
            return {
                retrieve: jest.fn().mockResolvedValue({
                    id: 'prod_123',
                    metadata: { id_seller: 'seller_abc' },
                    title: 'Test Product'
                })
            }
        }
        if (key === 'logger') {
            return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        }
        return {}
    })
}

describe('product-updated subscriber', () => {
    it('syncs product to firestore when id_seller exists', async () => {
        const mockSnap = { empty: false, docs: [{ id: 'storeName' }] }
        // @ts-ignore
        admin.firestore().get.mockResolvedValueOnce(mockSnap)

        await productUpdatedHandler({
            event: { name: 'product.updated', data: { id: 'prod_123' } },
            container: mockContainer
        })

        expect(admin.firestore().collection).toHaveBeenCalledWith('store')
        expect(admin.firestore().doc).toHaveBeenCalledWith('store/storeName/products/prod_123')
        expect(admin.firestore().set).toHaveBeenCalled()
    })

    it('logs warning when id_seller missing', async () => {
        const productService = mockContainer.resolve('product')
        productService.retrieve.mockResolvedValueOnce({ id: 'prod_124', metadata: {} })
        const logger = mockContainer.resolve('logger')
        await productUpdatedHandler({
            event: { name: 'product.updated', data: { id: 'prod_124' } },
            container: mockContainer
        })
        expect(logger.warn).toHaveBeenCalled()
    })
})
